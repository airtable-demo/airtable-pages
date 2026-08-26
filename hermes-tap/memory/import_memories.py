"""import_memories.py — bulk-load pruned memories into Honcho or Mem0.

Input: pruned_memories.jsonl  (one {"content", "category", "importance",
"agent_scope"} per line — agent_scope = 'autobdr' | 'psu-sequencer' | ... | 'global')

Honcho:  HONCHO_API_KEY + HONCHO_WORKSPACE in env. Per-agent scoping -> one
         Honcho peer per agent ('autobdr', 'psu-sequencer', ...) so memory
         stays isolated per profile; 'global' memories go to every peer.
Mem0:    MEM0_API_KEY in env, platform mode. Per-agent scoping -> agent_id field.

Run:  python3 import_memories.py --provider honcho --file pruned_memories.jsonl --dry-run
      python3 import_memories.py --provider mem0  --file pruned_memories.jsonl
"""
from __future__ import annotations
import argparse, json, os, sys, urllib.request

AGENTS = ["autobdr", "psu-sequencer", "prospect-reply-drafter", "master-pipeline-agent"]


def load(path):
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def targets(mem):
    scope = mem.get("agent_scope", "global")
    return AGENTS if scope == "global" else [scope]


# ---- Honcho (REST) ---------------------------------------------------------
def push_honcho(mem, peer, dry):
    key = os.environ["HONCHO_API_KEY"]
    ws = os.environ.get("HONCHO_WORKSPACE", "hermes")
    base = os.environ.get("HONCHO_BASE_URL", "https://api.honcho.dev")
    # store as a user message on the agent's peer, tagged with category/importance
    body = json.dumps({
        "messages": [{
            "content": f"[memory|{mem.get('category','fact')}|imp{mem.get('importance',3)}] {mem['content']}",
            "peer": peer,
        }]
    }).encode()
    url = f"{base}/v1/workspaces/{ws}/sessions/import-{peer}/peers/{peer}/messages"
    if dry:
        return ("dry", peer)
    req = urllib.request.Request(url, data=body, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return (r.status, peer)


# ---- Mem0 (REST) -----------------------------------------------------------
def push_mem0(mem, agent_id, dry):
    key = os.environ["MEM0_API_KEY"]
    body = json.dumps({
        "messages": [{"role": "user", "content": mem["content"]}],
        "agent_id": agent_id,
        "metadata": {"category": mem.get("category"), "importance": mem.get("importance")},
    }).encode()
    if dry:
        return ("dry", agent_id)
    req = urllib.request.Request("https://api.mem0.ai/v1/memories/", data=body,
        method="POST", headers={"Authorization": f"Token {key}",
                                "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return (r.status, agent_id)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["honcho", "mem0"], required=True)
    ap.add_argument("--file", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    mems = load(a.file)
    push = push_honcho if a.provider == "honcho" else push_mem0
    total = ok = 0
    for m in mems:
        for t in targets(m):
            total += 1
            try:
                status, tgt = push(m, t, a.dry_run)
                ok += 1
                if total % 50 == 0:
                    print(f"  …{ok}/{total}", flush=True)
            except Exception as e:
                print(f"  FAIL {t}: {e}", file=sys.stderr)
    print(f"done: {ok}/{total} memories pushed to {a.provider} "
          f"({'dry-run' if a.dry_run else 'live'})")


if __name__ == "__main__":
    main()
