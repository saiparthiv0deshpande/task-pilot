import asyncio
import os
import re
import urllib.parse
import uuid
from contextlib import AsyncExitStack
from datetime import date, datetime, timezone
from typing import Literal, Optional

import jwt
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from google import genai
from google.genai import types
from mcp.client.sse import sse_client
from mcp.client.session import ClientSession

from encryption import decrypt_token, encrypt_token

load_dotenv()


def required_env(name: str) -> str:
    value = os.getenv(name)
    value = value.strip() if value else ""
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


JWT_ACCESS_SECRET = required_env("JWT_ACCESS_SECRET")
if len(JWT_ACCESS_SECRET) < 32:
    raise RuntimeError("JWT_ACCESS_SECRET must contain at least 32 characters")
ENCRYPTION_KEY = required_env("ENCRYPTION_KEY")
if len(ENCRYPTION_KEY.encode("utf-8")) != 32:
    raise RuntimeError("ENCRYPTION_KEY must be exactly 32 UTF-8 bytes")
MONGO_URI = required_env("MONGO_URI")
FRONTEND_URL = required_env("FRONTEND_URL")
GEMINI_API_KEY = required_env("GEMINI_API_KEY")
GEMINI_MODEL = required_env("GEMINI_MODEL")
TASK_MCP_URL = required_env("TASK_MCP_URL")
GITHUB_MCP_URL = required_env("GITHUB_MCP_URL")
PORT = int(required_env("PORT"))
if PORT < 1 or PORT > 65535:
    raise RuntimeError("PORT must be a valid TCP port")

frontend_parts = urllib.parse.urlparse(FRONTEND_URL)
if frontend_parts.scheme not in ("http", "https") or not frontend_parts.netloc or frontend_parts.path not in ("", "/") or frontend_parts.query or frontend_parts.fragment:
    raise RuntimeError("FRONTEND_URL must be an HTTP origin without a path, query, or fragment")
FRONTEND_URL = f"{frontend_parts.scheme}://{frontend_parts.netloc}"
for setting_name, endpoint in (("TASK_MCP_URL", TASK_MCP_URL), ("GITHUB_MCP_URL", GITHUB_MCP_URL)):
    parsed_endpoint = urllib.parse.urlparse(endpoint)
    if parsed_endpoint.scheme not in ("http", "https") or not parsed_endpoint.netloc:
        raise RuntimeError(f"{setting_name} must be an HTTP or HTTPS URL")

mongo_path = urllib.parse.urlparse(MONGO_URI).path.lstrip("/")
if not mongo_path:
    raise RuntimeError("MONGO_URI must include the database name in its path")

client = AsyncIOMotorClient(MONGO_URI)
db = client[mongo_path]
ai_client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI(title="Task Pilot API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


class ChatRequest(BaseModel):
    conversation_id: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=12000)


class ConversationCreate(BaseModel):
    title: str = Field(default="New chat", min_length=1, max_length=100)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=100)


class TaskCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=3000)
    status: Literal["todo", "in_progress", "done"] = "todo"
    priority: Literal["low", "medium", "high"] = "medium"
    due_date: Optional[str] = Field(default=None, alias="dueDate")


class TaskUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=3000)
    status: Optional[Literal["todo", "in_progress", "done"]] = None
    priority: Optional[Literal["low", "medium", "high"]] = None
    due_date: Optional[str] = Field(default=None, alias="dueDate")


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    try:
        if not authorization:
            raise ValueError("Missing bearer token")
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise ValueError("Invalid authorization scheme")
        payload = jwt.decode(token, JWT_ACCESS_SECRET, algorithms=["HS256"])
        if payload.get("tokenType") != "access":
            raise ValueError("Invalid token type")
        user_id = ObjectId(payload["userId"])
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication required")

    user = await db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="Account no longer exists")

    encrypted_token = user.get("githubAccessToken") or ""
    return {
        "user_id": str(user_id),
        "github_ciphertext": encrypted_token,
        "github_token": "",
        "github_connected": bool(encrypted_token),
    }


def as_iso(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return value


def visible_messages(history: list) -> list[dict]:
    result = []
    for item in history:
        role = item.get("role")
        if role not in ("user", "model", "assistant"):
            continue
        texts = []
        for part in item.get("parts", []):
            text = part.get("text") if isinstance(part, dict) else getattr(part, "text", None)
            if text:
                texts.append(text)
        text = "\n".join(texts).strip()
        if text:
            result.append({"role": "assistant" if role in ("model", "assistant") else "user", "text": text})
    return result


def user_visible_history(document: dict) -> list[dict]:
    if isinstance(document.get("modelHistory"), list):
        return document.get("messages", [])
    return visible_messages(document.get("messages", []))


def serialize_task(task: dict) -> dict:
    return {
        "id": str(task["_id"]),
        "title": task.get("title", ""),
        "description": task.get("description", ""),
        "status": task.get("status", "todo"),
        "priority": task.get("priority", "medium"),
        "dueDate": task.get("dueDate"),
        "createdAt": as_iso(task.get("createdAt")),
        "updatedAt": as_iso(task.get("updatedAt")),
    }


def require_object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail="Not found")
    return ObjectId(value)


@app.on_event("startup")
async def initialize_indexes():
    await db.chat_histories.create_index([("userId", 1), ("conversationId", 1)], unique=True)
    await db.tasks.create_index([("userId", 1), ("status", 1)])


@app.on_event("shutdown")
async def close_database():
    client.close()


@app.get("/health")
async def health():
    await client.admin.command("ping")
    return {"status": "ok", "service": "task-pilot-api"}


@app.get("/tasks")
async def list_tasks(
    status: Optional[Literal["todo", "in_progress", "done"]] = None,
    priority: Optional[Literal["low", "medium", "high"]] = None,
    search: Optional[str] = Query(default=None, max_length=200),
    user: dict = Depends(get_current_user),
):
    query = {"userId": ObjectId(user["user_id"])}
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if search and search.strip():
        query["title"] = {"$regex": re.escape(search.strip()), "$options": "i"}
    tasks = await db.tasks.find(query).sort([("updatedAt", -1), ("_id", -1)]).to_list(length=500)
    return {"tasks": [serialize_task(task) for task in tasks]}


@app.post("/tasks", status_code=201)
async def create_task(payload: TaskCreate, user: dict = Depends(get_current_user)):
    due_date = payload.due_date
    if due_date:
        try:
            date.fromisoformat(due_date)
        except ValueError:
            raise HTTPException(status_code=422, detail="Due date must use YYYY-MM-DD format")
    now = datetime.now(timezone.utc)
    document = {
        "userId": ObjectId(user["user_id"]),
        "title": payload.title.strip(),
        "description": (payload.description or "").strip(),
        "status": payload.status,
        "priority": payload.priority,
        "dueDate": due_date,
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db.tasks.insert_one(document)
    document["_id"] = result.inserted_id
    return {"task": serialize_task(document)}


@app.patch("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, user: dict = Depends(get_current_user)):
    task_object_id = require_object_id(task_id)
    updates = payload.model_dump(exclude_unset=True, by_alias=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No task changes were provided")
    if "title" in updates:
        updates["title"] = updates["title"].strip()
    if "description" in updates:
        updates["description"] = (updates["description"] or "").strip()
    if updates.get("dueDate"):
        try:
            date.fromisoformat(updates["dueDate"])
        except ValueError:
            raise HTTPException(status_code=422, detail="Due date must use YYYY-MM-DD format")
    updates["updatedAt"] = datetime.now(timezone.utc)
    result = await db.tasks.find_one_and_update(
        {"_id": task_object_id, "userId": ObjectId(user["user_id"])},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task": serialize_task(result)}


@app.delete("/tasks/{task_id}", status_code=204)
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    result = await db.tasks.delete_one({"_id": require_object_id(task_id), "userId": ObjectId(user["user_id"] )})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Task not found")


@app.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    cursor = db.chat_histories.find({"userId": ObjectId(user["user_id"])}).sort("updatedAt", -1).limit(100)
    documents = await cursor.to_list(length=100)
    conversations = []
    for doc in documents:
        messages = user_visible_history(doc)
        conversations.append({
            "conversationId": doc["conversationId"],
            "title": doc.get("title") or "New chat",
            "preview": messages[-1]["text"][:120] if messages else "",
            "messageCount": len(messages),
            "createdAt": as_iso(doc.get("createdAt")),
            "updatedAt": as_iso(doc.get("updatedAt")),
        })
    return {"conversations": conversations}


@app.post("/conversations", status_code=201)
async def create_conversation(payload: ConversationCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    conversation_id = str(uuid.uuid4())
    document = {
        "userId": ObjectId(user["user_id"]),
        "conversationId": conversation_id,
        "title": payload.title.strip() or "New chat",
        "messages": [],
        "modelHistory": [],
        "createdAt": now,
        "updatedAt": now,
    }
    await db.chat_histories.insert_one(document)
    return {"conversation": {"conversationId": conversation_id, "title": document["title"], "messages": [], "createdAt": now.isoformat(), "updatedAt": now.isoformat()}}


@app.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    doc = await db.chat_histories.find_one({"userId": ObjectId(user["user_id"]), "conversationId": conversation_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"conversation": {
        "conversationId": doc["conversationId"],
        "title": doc.get("title") or "New chat",
        "messages": user_visible_history(doc),
        "createdAt": as_iso(doc.get("createdAt")),
        "updatedAt": as_iso(doc.get("updatedAt")),
    }}


@app.patch("/conversations/{conversation_id}")
async def rename_conversation(conversation_id: str, payload: ConversationRename, user: dict = Depends(get_current_user)):
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Conversation title cannot be empty")
    result = await db.chat_histories.find_one_and_update(
        {"userId": ObjectId(user["user_id"]), "conversationId": conversation_id},
        {"$set": {"title": title, "updatedAt": datetime.now(timezone.utc)}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"conversationId": conversation_id, "title": title}


@app.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    result = await db.chat_histories.delete_one({"userId": ObjectId(user["user_id"]), "conversationId": conversation_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Conversation not found")


async def get_mcp_tools(session: ClientSession, server_name: str):
    tools_response = await session.list_tools()
    declarations = []
    for tool in tools_response.tools:
        props = tool.input_schema.get("properties", {}).copy()
        required = tool.input_schema.get("required", []).copy()
        for protected in ("user_id", "github_token"):
            props.pop(protected, None)
            if protected in required:
                required.remove(protected)
        declarations.append(types.FunctionDeclaration(
            name=f"{server_name}__{tool.name}",
            description=tool.description,
            parameters={"type": "OBJECT", "properties": props, "required": required},
        ))
    return declarations


async def chat_endpoint(req: ChatRequest, user: dict):
    user_id = ObjectId(user["user_id"])
    doc = await db.chat_histories.find_one({"userId": user_id, "conversationId": req.conversation_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")

    model_history = doc.get("modelHistory")
    if model_history is None:
        model_history = doc.get("messages", [])
    visible = user_visible_history(doc)
    message_text = req.message.strip()
    visible.append({"role": "user", "text": message_text})
    model_history.append({"role": "user", "parts": [{"text": message_text}]})

    github_action = re.search(r"\b(list|show|create|open|check|fetch|view|search|find|read|look at|manage)\b", message_text, re.I)
    github_target = re.search(r"\b(github|repos?|repository|repositories|issues?|pull requests?)\b", message_text, re.I)
    if not user.get("github_connected") and github_action and github_target:
        response_text = "Connect GitHub to let me work with your repositories and issues. Your task manager and regular chat remain available without it."
        visible.append({"role": "assistant", "text": response_text, "toolsUsed": [], "action": "connect_github"})
        model_history.append({"role": "model", "parts": [{"text": response_text}]})
        now = datetime.now(timezone.utc)
        title = doc.get("title") or "New chat"
        if title == "New chat" and len(visible) <= 2:
            title = message_text[:60] or "New chat"
        await db.chat_histories.update_one(
            {"_id": doc["_id"], "userId": user_id},
            {"$set": {"messages": visible, "modelHistory": model_history, "title": title, "updatedAt": now}},
        )
        return {"text": response_text, "tools_used": [], "conversation_id": req.conversation_id, "action": "connect_github"}

    chat_user = dict(user)
    chat_user["github_connected"] = bool(user.get("github_connected") and github_target)
    if chat_user["github_connected"]:
        try:
            chat_user["github_token"] = decrypt_token(user["github_ciphertext"])
            if not user["github_ciphertext"].startswith("v2:"):
                await db.users.update_one(
                    {"_id": user_id},
                    {"$set": {"githubAccessToken": encrypt_token(chat_user["github_token"])}},
                )
        except Exception:
            raise HTTPException(status_code=503, detail="GitHub connection needs to be renewed")

    current_messages = [types.Content(**item) for item in model_history]
    tools_used = []

    async with AsyncExitStack() as stack:
        task_read, task_write = await stack.enter_async_context(sse_client(TASK_MCP_URL))
        task_session = await stack.enter_async_context(ClientSession(task_read, task_write))
        await task_session.initialize()
        task_tools = await get_mcp_tools(task_session, "task")

        github_session = None
        declarations = list(task_tools)
        if chat_user.get("github_connected"):
            github_read, github_write = await stack.enter_async_context(sse_client(GITHUB_MCP_URL))
            github_session = await stack.enter_async_context(ClientSession(github_read, github_write))
            await github_session.initialize()
            declarations.extend(await get_mcp_tools(github_session, "github"))
        config = types.GenerateContentConfig(
            tools=[types.Tool(function_declarations=declarations)],
            system_instruction=(
                "You are Task Pilot, a personal productivity assistant. Use task tools for requested task changes. "
                "Never claim an action succeeded unless its tool confirms it. "
                + ("The user has no active GitHub connection for this request; explain that GitHub actions require connecting it from the GitHub page." if not chat_user.get("github_connected") else "The user has connected GitHub; use GitHub tools for repository and issue requests.")
            ),
        )

        for _round in range(8):
            response = await asyncio.to_thread(
                ai_client.models.generate_content,
                model=GEMINI_MODEL,
                contents=current_messages,
                config=config,
            )
            if not response.candidates:
                raise HTTPException(status_code=502, detail="The assistant did not return a response")
            current_messages.append(response.candidates[0].content)
            function_calls = response.function_calls or []
            if not function_calls:
                break

            for call in function_calls:
                tool_name = call.name
                args = dict(call.args or {})
                tools_used.append(tool_name)
                if tool_name.startswith("task__"):
                    args["user_id"] = user["user_id"]
                    result = await task_session.call_tool(tool_name.removeprefix("task__"), arguments=args)
                elif tool_name.startswith("github__") and github_session:
                    args["github_token"] = chat_user["github_token"]
                    result = await github_session.call_tool(tool_name.removeprefix("github__"), arguments=args)
                else:
                    raise HTTPException(status_code=403, detail="Connect GitHub before requesting GitHub actions")
                result_text = "\n".join(getattr(item, "text", "") for item in result.content) or "Tool completed without a text result."
                if getattr(result, "isError", False):
                    result_text = f"Tool error: {result_text}"
                current_messages.append(types.Content(
                    role="user",
                    parts=[types.Part.from_function_response(name=tool_name, response={"result": result_text})],
                ))

        if response.function_calls:
            response = await asyncio.to_thread(
                ai_client.models.generate_content,
                model=GEMINI_MODEL,
                contents=current_messages,
                config=types.GenerateContentConfig(
                    system_instruction="Summarize the confirmed tool results. Do not request or claim additional actions."
                ),
            )
            if not response.candidates:
                raise HTTPException(status_code=502, detail="The assistant did not return a summary")
            current_messages.append(response.candidates[0].content)

    response_text = response.text or "I completed the requested action."
    connect_action = bool(
        not user.get("github_connected")
        and github_target
        and re.search(r"connect|authorize|github page|not connected", response_text, re.I)
    )
    assistant_message = {"role": "assistant", "text": response_text, "toolsUsed": tools_used}
    if connect_action:
        assistant_message["action"] = "connect_github"
    visible.append(assistant_message)
    serializable_history = [item.model_dump() for item in current_messages]
    now = datetime.now(timezone.utc)
    title = doc.get("title") or "New chat"
    if title == "New chat" and len(visible) <= 2:
        title = message_text[:60] or "New chat"
    await db.chat_histories.update_one(
        {"_id": doc["_id"], "userId": user_id},
        {"$set": {"messages": visible, "modelHistory": serializable_history, "title": title, "updatedAt": now}},
    )
    result = {"text": response_text, "tools_used": tools_used, "conversation_id": req.conversation_id}
    if connect_action:
        result["action"] = "connect_github"
    return result


@app.post("/chat")
async def chat(req: ChatRequest, user: dict = Depends(get_current_user)):
    try:
        return await chat_endpoint(req, user)
    except HTTPException:
        raise
    except Exception as error:
        print(f"Chat request failed: {type(error).__name__}")
        raise HTTPException(status_code=502, detail="The assistant could not complete this request")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT)
