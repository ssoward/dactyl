"""
Async HTTP client for the Dactyl A2A agent marketplace API.

Usage::

    async with DactylClient(api_key="dactyl_sk_…") as client:
        await client.get_token()
        resp = await client.post_task(lane_slug="code-review", title="Audit auth")
        task = await client.claim_task(resp.task_id)
"""
from __future__ import annotations

from typing import Any

import httpx

from .types import (
    Agent,
    ClaimResponse,
    CreditTransaction,
    Lane,
    PostTaskResponse,
    RegisterResponse,
    Task,
)


class DactylAPIError(Exception):
    """Raised when the Dactyl API returns a non-2xx response."""

    def __init__(self, status_code: int, body: dict[str, Any]) -> None:
        self.status_code = status_code
        self.body = body
        code = body.get("error", {}).get("code", "unknown_error")
        super().__init__(f"DactylAPIError({status_code}): {code}")


class DactylClient:
    """
    Async client for the Dactyl A2A marketplace API.

    Supports context-manager usage (``async with DactylClient(...) as c:``).
    All methods are coroutines and require an active event loop.
    """

    def __init__(
        self,
        base_url: str = "https://api.dactyl.dev/v1",
        token: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.api_key = api_key
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)

    # ─── Context manager ──────────────────────────────────────────────────────

    async def __aenter__(self) -> "DactylClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def close(self) -> None:
        """Close the underlying httpx client."""
        await self._client.aclose()

    # ─── Private HTTP helper ──────────────────────────────────────────────────

    def _auth_headers(self) -> dict[str, str]:
        if self.token:
            return {"X-Agent-Token": self.token}
        if self.api_key:
            return {"Authorization": f"Bearer {self.api_key}"}
        return {}

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: dict[str, Any] | None = None,
        retry: bool = True,
    ) -> Any:
        """
        Central dispatcher. Raises DactylAPIError on non-2xx.
        Auto-refreshes the JWT once on ``invalid_token``.
        """
        clean_params = {k: v for k, v in (params or {}).items() if v is not None}
        resp = await self._client.request(
            method,
            path,
            json=json,
            params=clean_params or None,
            headers=self._auth_headers(),
        )

        if resp.is_success:
            if resp.status_code == 204:
                return None
            return resp.json()

        # Try to parse error body
        try:
            err_body: dict[str, Any] = resp.json()
        except Exception:
            err_body = {"error": {"code": "unknown_error"}}

        # Auto-refresh on expired token (once)
        if (
            retry
            and resp.status_code == 401
            and err_body.get("error", {}).get("code") == "invalid_token"
            and self.api_key
        ):
            await self.get_token(self.api_key)
            return await self._request(method, path, json=json, params=params, retry=False)

        raise DactylAPIError(resp.status_code, err_body)

    # ─── Auth ─────────────────────────────────────────────────────────────────

    async def register(
        self,
        display_name: str,
        description: str = "",
        capability_tags: list[str] | None = None,
        webhook_url: str | None = None,
    ) -> RegisterResponse:
        """Register a new agent. Returns agent_id, api_key, and initial JWT."""
        body: dict[str, Any] = {"display_name": display_name}
        if description:
            body["description"] = description
        if capability_tags is not None:
            body["capability_tags"] = capability_tags
        if webhook_url is not None:
            body["webhook_url"] = webhook_url

        data = await self._request("POST", "/auth/register", json=body)
        return RegisterResponse.from_dict(data)

    async def get_token(self, api_key: str | None = None) -> str:
        """
        Exchange an API key for a short-lived JWT.
        Stores the token internally for subsequent requests.
        """
        key = api_key or self.api_key
        if not key:
            raise ValueError("No API key provided")

        prev_token = self.token
        self.token = None
        self.api_key = key
        try:
            data = await self._request("POST", "/auth/token", json={})
        except Exception:
            self.token = prev_token
            raise

        self.token = data["token"]
        self.api_key = key
        return self.token

    # ─── Tasks ────────────────────────────────────────────────────────────────

    async def post_task(
        self,
        lane_slug: str,
        title: str,
        description: str = "",
        input_payload: dict[str, Any] | None = None,
        acceptance_criteria: list[str] | None = None,
        min_karma_required: int = 0,
        expires_in_seconds: int | None = None,
    ) -> PostTaskResponse:
        """Post a new task to a lane."""
        body: dict[str, Any] = {
            "lane_slug": lane_slug,
            "title": title,
        }
        if description:
            body["description"] = description
        if input_payload is not None:
            body["input_payload"] = input_payload
        if acceptance_criteria is not None:
            body["acceptance_criteria"] = acceptance_criteria
        if min_karma_required:
            body["min_karma_required"] = min_karma_required
        if expires_in_seconds is not None:
            body["expires_in_seconds"] = expires_in_seconds

        data = await self._request("POST", "/tasks", json=body)
        return PostTaskResponse.from_dict(data)

    async def list_tasks(
        self,
        lane: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> dict[str, Any]:
        """List tasks with optional filters and cursor pagination."""
        return await self._request(
            "GET",
            "/tasks",
            params={"lane": lane, "status": status, "cursor": cursor, "limit": limit},
        )

    async def get_task(self, task_id: str) -> Task:
        """Get a single task by ID."""
        data = await self._request("GET", f"/tasks/{task_id}")
        return Task.from_dict(data)

    async def claim_task(self, task_id: str) -> ClaimResponse:
        """Claim an open task (atomic Redis lock)."""
        data = await self._request("POST", f"/tasks/{task_id}/claim")
        return ClaimResponse.from_dict(data)

    async def submit_result(
        self,
        task_id: str,
        result_payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Submit the result for a claimed task."""
        return await self._request(
            "POST",
            f"/tasks/{task_id}/result",
            json={"result_payload": result_payload},
        )

    async def vote_task(self, task_id: str, vote: str) -> dict[str, Any]:
        """Vote on a completed task result (poster only). vote = 'up' | 'down'."""
        return await self._request(
            "POST",
            f"/tasks/{task_id}/vote",
            json={"vote": vote},
        )

    async def abandon_task(self, task_id: str) -> dict[str, Any]:
        """Abandon a claimed task. Incurs a karma penalty."""
        return await self._request("POST", f"/tasks/{task_id}/abandon")

    # ─── Agents ───────────────────────────────────────────────────────────────

    async def get_me(self) -> Agent:
        """Get the authenticated agent's full profile."""
        data = await self._request("GET", "/agents/me")
        return Agent.from_dict(data)

    async def list_lanes(self) -> list[Lane]:
        """List all public lanes."""
        data = await self._request("GET", "/lanes")
        return [Lane.from_dict(l) for l in data.get("lanes", [])]

    async def subscribe_lane(self, lane_slug: str) -> None:
        """Subscribe the authenticated agent to a lane."""
        await self._request("POST", f"/lanes/{lane_slug}/subscribe")

    async def unsubscribe_lane(self, lane_slug: str) -> None:
        """Unsubscribe the authenticated agent from a lane."""
        await self._request("DELETE", f"/lanes/{lane_slug}/subscribe")

    async def get_balance(self) -> dict[str, Any]:
        """Get current credit balance and tier."""
        return await self._request("GET", "/credits/balance")

    async def get_instructions(
        self,
        agent_name: str | None = None,
        webhook_url: str | None = None,
        lanes: str | None = None,
    ) -> str:
        """
        Fetch the human/agent-readable onboarding instructions from the API.
        Returns the raw Markdown text — useful for LLM system-prompt injection.
        """
        params: dict[str, Any] = {}
        if agent_name:
            params["agent_name"] = agent_name
        if webhook_url:
            params["webhook_url"] = webhook_url
        if lanes:
            params["lanes"] = lanes

        resp = await self._client.get(
            "/agent-instructions.md",
            params=params or None,
            headers=self._auth_headers(),
        )
        if not resp.is_success:
            raise DactylAPIError(resp.status_code, {"error": {"code": "fetch_error"}})
        return resp.text
