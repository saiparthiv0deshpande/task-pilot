import os
import urllib.parse
from dotenv import load_dotenv
from fastmcp import FastMCP
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from typing import Optional

# Load environment variables
load_dotenv()

# Initialize FastMCP Server
mcp = FastMCP("TaskManager")

# -----------------------------------------------------------------------------
# MongoDB Setup
# -----------------------------------------------------------------------------
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    print("WARNING: MONGO_URI not found. Please configure your .env file.")
    # Fallback for initialization so the script doesn't crash on import
    MONGO_URI = "mongodb://localhost:27017/ai_assistant"

client = AsyncIOMotorClient(MONGO_URI)

# Extract database name from URI, default to 'ai_assistant' if none is specified
parsed_uri = urllib.parse.urlparse(MONGO_URI)
db_name = parsed_uri.path.lstrip('/')
if not db_name:
    db_name = "ai_assistant"

db = client[db_name]
# Mongoose automatically pluralizes the "Task" schema to "tasks"
tasks_collection = db["tasks"]

# -----------------------------------------------------------------------------
# Tool Definitions
# -----------------------------------------------------------------------------
# Notice: EVERY tool requires a `user_id`. This is our strict security model.
# The Orchestrator will inject this, so users can only ever access their own tasks.

@mcp.tool()
async def create_task(user_id: str, title: str, priority: str = "medium", due_date: Optional[str] = None) -> str:
    """Creates a new task for the user."""
    task_doc = {
        "userId": ObjectId(user_id),
        "title": title,
        "status": "todo",
        "priority": priority,
        "dueDate": due_date
    }
    result = await tasks_collection.insert_one(task_doc)
    return f"Task created successfully with ID: {str(result.inserted_id)}"

@mcp.tool()
async def list_tasks(user_id: str, status: Optional[str] = None) -> str:
    """Lists tasks for the user. Optional status filter (todo, in_progress, done)."""
    query = {"userId": ObjectId(user_id)}
    if status:
        query["status"] = status
    
    tasks = []
    async for task in tasks_collection.find(query):
        tasks.append(
            f"- ID: {str(task['_id'])} | Title: {task['title']} | Status: {task.get('status', 'todo')} | Priority: {task.get('priority', 'medium')}"
        )
    
    if not tasks:
        return "You have no tasks matching this criteria."
    return "\n".join(tasks)

@mcp.tool()
async def update_task(user_id: str, task_id: str, status: Optional[str] = None, priority: Optional[str] = None) -> str:
    """Updates a task's status or priority."""
    updates = {}
    if status:
        updates["status"] = status
    if priority:
        updates["priority"] = priority
        
    if not updates:
        return "No updates provided."

    result = await tasks_collection.update_one(
        {"_id": ObjectId(task_id), "userId": ObjectId(user_id)},
        {"$set": updates}
    )
    
    if result.modified_count > 0:
        return f"Task {task_id} updated successfully."
    return f"Task not found or you do not have permission to update it."

@mcp.tool()
async def delete_task(user_id: str, task_id: str) -> str:
    """Deletes a task by ID."""
    result = await tasks_collection.delete_one(
        {"_id": ObjectId(task_id), "userId": ObjectId(user_id)}
    )
    if result.deleted_count > 0:
        return f"Task {task_id} deleted successfully."
    return "Task not found or already deleted."

# -----------------------------------------------------------------------------
# Server Execution
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"Starting Task Manager MCP Server on SSE transport (Port {port})...")
    mcp.run(transport='sse', host="0.0.0.0", port=port)
