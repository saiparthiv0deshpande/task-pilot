from fastmcp import FastMCP
from github import Github
from github import Auth

# Initialize FastMCP Server
mcp = FastMCP("GitHubTools")

# -----------------------------------------------------------------------------
# Tool Definitions
# -----------------------------------------------------------------------------
# Notice: EVERY tool requires a `github_token`. 
# The Orchestrator will inject the decrypted OAuth token securely.

@mcp.tool()
def list_repos(github_token: str) -> str:
    """Lists all repositories for the authenticated user."""
    auth = Auth.Token(github_token)
    g = Github(auth=auth)
    
    repos = []
    try:
        for repo in g.get_user().get_repos(type="owner"):
            repos.append(f"- {repo.full_name}")
        return "\n".join(repos) if repos else "No repositories found."
    except Exception as e:
        return f"Error connecting to GitHub: {str(e)}"

@mcp.tool()
def list_issues(github_token: str, repo_name: str, state: str = "open") -> str:
    """Lists issues in a specific repository (e.g., 'username/repo-name'). State can be 'open' or 'closed'."""
    auth = Auth.Token(github_token)
    g = Github(auth=auth)
    
    issues_list = []
    try:
        repo = g.get_repo(repo_name)
        issues = repo.get_issues(state=state)
        for issue in issues:
            issues_list.append(f"- [#{issue.number}] {issue.title} (Status: {issue.state})")
        return "\n".join(issues_list) if issues_list else f"No {state} issues found in {repo_name}."
    except Exception as e:
        return f"Error fetching issues for {repo_name}: {str(e)}"

@mcp.tool()
def create_issue(github_token: str, repo_name: str, title: str, body: str) -> str:
    """Creates a new issue in a specific repository."""
    auth = Auth.Token(github_token)
    g = Github(auth=auth)
    
    try:
        repo = g.get_repo(repo_name)
        issue = repo.create_issue(title=title, body=body)
        return f"Issue created successfully! View it here: {issue.html_url}"
    except Exception as e:
        return f"Error creating issue in {repo_name}: {str(e)}"

if __name__ == "__main__":
    # Import os to get environment variables for deployment
    import os
    port = int(os.getenv("PORT", 8001))
    print(f"Starting GitHub MCP Server on SSE transport (Port {port})...")
    mcp.run(transport='sse', host="0.0.0.0", port=port)
