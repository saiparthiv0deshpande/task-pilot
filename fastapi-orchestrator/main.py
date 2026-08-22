import os
import urllib.parse
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import jwt
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from google import genai
from google.genai import types
from mcp.client.sse import sse_client
from mcp.client.session import ClientSession
from encryption import decrypt_token
from dotenv import load_dotenv

load_dotenv()

# Setup config
JWT_SECRET = os.getenv("JWT_SECRET", "dev_secret")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/ai_assistant")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

TASK_MCP_URL = os.getenv("TASK_MCP_URL", "http://localhost:8000/sse")
GITHUB_MCP_URL = os.getenv("GITHUB_MCP_URL", "http://localhost:8001/sse")

# Setup MongoDB
client = AsyncIOMotorClient(MONGO_URI)
db_name = urllib.parse.urlparse(MONGO_URI).path.lstrip('/') or "ai_assistant"
db = client[db_name]

# Setup Gemini
ai_client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    conversation_id: str
    message: str

# -----------------------------------------------------------------------------
# Security Middleware (Stateless Auth via JWT)
# -----------------------------------------------------------------------------
async def get_current_user(authorization: str = Header(...)):
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid auth scheme")
        
        # Verify the Express.js JWT
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        
        # Look up the user to grab their encrypted GitHub token
        user = await db.users.find_one({"_id": ObjectId(payload["userId"])})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        return {
            "user_id": str(user["_id"]),
            "github_token": decrypt_token(user.get("githubAccessToken", ""))
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Unauthorized: {str(e)}")

# -----------------------------------------------------------------------------
# Helper: Fetch MCP Tools & Strip Sensitive Parameters
# -----------------------------------------------------------------------------
async def get_mcp_tools(session: ClientSession, server_name: str):
    tools_response = await session.list_tools()
    formatted_tools = []
    
    for tool in tools_response.tools:
        props = tool.input_schema.get("properties", {}).copy()
        reqs = tool.input_schema.get("required", []).copy()
        
        # STRIP OUT SECURITY CONTEXT - LLM must never see these!
        if "user_id" in props: del props["user_id"]
        if "github_token" in props: del props["github_token"]
        if "user_id" in reqs: reqs.remove("user_id")
        if "github_token" in reqs: reqs.remove("github_token")
            
        gemini_tool = types.FunctionDeclaration(
            name=f"{server_name}__{tool.name}", # e.g., task__create_task
            description=tool.description,
            parameters={"type": "OBJECT", "properties": props, "required": reqs}
        )
        formatted_tools.append(gemini_tool)
    return formatted_tools

# -----------------------------------------------------------------------------
# Core Chat Engine (The Loop)
# -----------------------------------------------------------------------------
@app.post("/chat")
async def chat_endpoint(req: ChatRequest, user: dict = Depends(get_current_user)):
    
    # 1. Load History (The "Memory")
    history_doc = await db.chat_histories.find_one({
        "userId": ObjectId(user["user_id"]),
        "conversationId": req.conversation_id
    })
    messages = history_doc["messages"] if history_doc else []
    messages.append({"role": "user", "parts": [{"text": req.message}]})
    current_messages = [types.Content(**m) for m in messages]
    
    tools_used_this_turn = []
    
    # 2. Connect to MCP Servers (In production, use connection pooling)
    async with sse_client(TASK_MCP_URL) as (task_read, task_write):
        async with ClientSession(task_read, task_write) as task_session:
            await task_session.initialize()
            
            async with sse_client(GITHUB_MCP_URL) as (git_read, git_write):
                async with ClientSession(git_read, git_write) as git_session:
                    await git_session.initialize()
                    
                    # Merge schemas
                    task_tools = await get_mcp_tools(task_session, "task")
                    git_tools = await get_mcp_tools(git_session, "github")
                    gemini_config = types.Tool(function_declarations=task_tools + git_tools)
                    
                    # 3. The Function Calling Loop
                    while True:
                        response = ai_client.models.generate_content(
                            model='gemini-3.5-flash-lite',
                            contents=current_messages,
                            config=types.GenerateContentConfig(tools=[gemini_config])
                        )
                        
                        current_messages.append(response.candidates[0].content)
                        
                        # Did Gemini ask to use a tool?
                        if response.function_calls:
                            for fn_call in response.function_calls:
                                tool_name = fn_call.name
                                tools_used_this_turn.append(tool_name)
                                args = fn_call.args if fn_call.args else {}
                                
                                # 4. SECURE INJECTION & EXECUTION
                                if tool_name.startswith("task__"):
                                    real_name = tool_name.replace("task__", "")
                                    args["user_id"] = user["user_id"] # Inject!
                                    result = await task_session.call_tool(real_name, arguments=args)
                                    
                                elif tool_name.startswith("github__"):
                                    real_name = tool_name.replace("github__", "")
                                    args["github_token"] = user["github_token"] # Inject!
                                    result = await git_session.call_tool(real_name, arguments=args)
                                    
                                else:
                                    result = "Error: Unknown tool."
                                
                                # Format result back for Gemini
                                result_text = result.content[0].text if hasattr(result, 'content') else str(result)
                                func_resp = types.Part.from_function_response(
                                    name=tool_name, response={"result": result_text}
                                )
                                current_messages.append(types.Content(role="user", parts=[func_resp]))
                            
                            # Loop repeats so Gemini can read the results!
                            continue
                        else:
                            # Gemini finished thinking and returned text.
                            break
                    
                    # 5. Save State back to Mongo
                    serializable_history = [c.model_dump() for c in current_messages]
                    await db.chat_histories.update_one(
                        {"conversationId": req.conversation_id, "userId": ObjectId(user["user_id"])},
                        {"$set": {"messages": serializable_history}},
                        upsert=True
                    )
                    
                    # 6. Return Clean UI Data
                    return {
                        "text": response.text,
                        "tools_used": tools_used_this_turn
                    }

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 8080))
    print(f"Starting FastAPI Orchestrator on port {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port)
