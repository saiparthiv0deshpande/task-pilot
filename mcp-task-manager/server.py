import os
import urllib.parse
from datetime import date, datetime, timezone
from dotenv import load_dotenv
from fastmcp import FastMCP
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from typing import Literal, Optional

# Load environment variables
load_dotenv()

# Initialize FastMCP Server
mcp = FastMCP("TaskManager")

# -----------------------------------------------------------------------------
# MongoDB Setup
# -----------------------------------------------------------------------------
MONGO_URI = os.getenv("MONGO_URI")
MONGO_URI = MONGO_URI.strip() if MONGO_URI else ""
if not MONGO_URI:
    raise RuntimeError("Missing required environment variable: MONGO_URI")

client = AsyncIOMotorClient(MONGO_URI)

# Select the database named in the required MongoDB URI.
parsed_uri = urllib.parse.urlparse(MONGO_URI)
db_name = parsed_uri.path.lstrip('/')
if not db_name:
    raise RuntimeError("MONGO_URI must include the database name in its path")

db = client[db_name]
# Mongoose automatically pluralizes the "Task" schema to "tasks"
tasks_collection = db["tasks"]

# -----------------------------------------------------------------------------
# Tool Definitions
# -----------------------------------------------------------------------------
# Notice: EVERY tool requires a `user_id`. This is our strict security model.
# The Orchestrator will inject this, so users can only ever access their own tasks.

@mcp.tool()
async def create_task(
    user_id: str,
    title: str,
    description: Optional[str] = None,
    priority: Literal["low", "medium", "high"] = "medium",
    due_date: Optional[str] = None,
) -> str:
    """Creates a new task for the user."""
    title = title.strip()
    if not title:
        return "A task title is required."
    if due_date:
        try:
            date.fromisoformat(due_date)
        except ValueError:
            return "Due date must use YYYY-MM-DD format."
    now = datetime.now(timezone.utc)
    task_doc = {
        "userId": ObjectId(user_id),
        "title": title,
        "description": (description or "").strip(),
        "status": "todo",
        "priority": priority,
        "dueDate": due_date,
        "createdAt": now,
        "updatedAt": now,
    }
    result = await tasks_collection.insert_one(task_doc)
    return f"Task created successfully with ID: {str(result.inserted_id)}"

@mcp.tool()
async def list_tasks(user_id: str, status: Optional[Literal["todo", "in_progress", "done"]] = None) -> str:
    """Lists tasks for the user. Optional status filter (todo, in_progress, done)."""
    query = {"userId": ObjectId(user_id)}
    if status:
        query["status"] = status
    
    tasks = []
    async for task in tasks_collection.find(query):
        description = f" | Details: {task['description']}" if task.get("description") else ""
        tasks.append(f"- ID: {str(task['_id'])} | Title: {task['title']} | Status: {task.get('status', 'todo')} | Priority: {task.get('priority', 'medium')} | Due: {task.get('dueDate') or 'none'}{description}")
    
    if not tasks:
        return "You have no tasks matching this criteria."
    return "\n".join(tasks)

@mcp.tool()
async def update_task(
    user_id: str,
    task_id: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    status: Optional[Literal["todo", "in_progress", "done"]] = None,
    priority: Optional[Literal["low", "medium", "high"]] = None,
    due_date: Optional[str] = None,
) -> str:
    """Updates a task's title, details, status, priority, or due date."""
    updates = {}
    if title is not None:
        title = title.strip()
        if not title:
            return "A task title cannot be empty."
        updates["title"] = title
    if description is not None:
        updates["description"] = description.strip()
    if status:
        updates["status"] = status
    if priority:
        updates["priority"] = priority
    if due_date is not None:
        if due_date:
            try:
                date.fromisoformat(due_date)
            except ValueError:
                return "Due date must use YYYY-MM-DD format."
        updates["dueDate"] = due_date
        
    if not updates:
        return "No updates provided."

    if not ObjectId.is_valid(task_id):
        return "Task not found or you do not have permission to update it."
    result = await tasks_collection.update_one(
        {"_id": ObjectId(task_id), "userId": ObjectId(user_id)},
        {"$set": {**updates, "updatedAt": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count > 0:
        return f"Task {task_id} updated successfully."
    return f"Task not found or you do not have permission to update it."

@mcp.tool()
async def delete_task(user_id: str, task_id: str) -> str:
    """Deletes a task by ID."""
    if not ObjectId.is_valid(task_id):
        return "Task not found or already deleted."
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
    port_value = os.getenv("PORT")
    port_value = port_value.strip() if port_value else ""
    if not port_value:
        raise RuntimeError("Missing required environment variable: PORT")
    port = int(port_value)
    if port < 1 or port > 65535:
        raise RuntimeError("PORT must be a valid TCP port")
    print(f"Starting Task Manager MCP Server on SSE transport (Port {port})...")
    mcp.run(transport='sse', host="0.0.0.0", port=port)
