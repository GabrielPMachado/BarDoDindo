"""Hook do Claude Code -> issue do GitHub -> app ClaudeLock no celular.

Copie para <seu-repo>/.claude/hooks/claude_lock.py (junto com o settings.json).
Não precisa de variável nem de liberar rede: usa o acesso ao GitHub que a
sessão já tem. Cada conversa tem seu próprio feed, num comentário da issue
"claudelock" do repositório; o comentário é EDITADO a cada evento (edições
não geram e-mail/notificação). Comentários de conversas paradas há mais de
1 dia são apagados quando uma conversa nova começa.
"""
import fcntl, json, os, re, subprocess, sys, tempfile, time

MAX_EVENTS = 15
OLD_FEED_SECONDS = 24 * 3600
STATE_DIR = os.path.join(tempfile.gettempdir(), "claudelock")


def short(s, n=140):
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1] + "…"


def last_assistant_text(path):
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()[-200:]
    except (OSError, TypeError):
        return ""
    for line in reversed(lines):
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        msg = obj.get("message") or {}
        if obj.get("type") == "assistant" and isinstance(msg.get("content"), list):
            for c in reversed(msg["content"]):
                if c.get("type") == "text" and c.get("text", "").strip():
                    return c["text"]
    return ""


def describe(tool, inp):
    inp = inp or {}
    f = os.path.basename(inp.get("file_path", "") or inp.get("notebook_path", ""))
    return {
        "Bash": ("⚙️", f"$ {short(inp.get('command', ''), 100)}"),
        "Read": ("📖", f"Lendo {f}"),
        "Edit": ("✏️", f"Editando {f}"),
        "MultiEdit": ("✏️", f"Editando {f}"),
        "Write": ("📝", f"Criando {f}"),
        "Grep": ("🔍", f"Buscando “{short(inp.get('pattern', ''), 50)}”"),
        "Glob": ("🔍", f"Procurando {inp.get('pattern', '')}"),
        "WebSearch": ("🌐", f"Pesquisando {short(inp.get('query', ''), 60)}"),
        "WebFetch": ("🌐", f"Abrindo {short(inp.get('url', ''), 60)}"),
        "Task": ("🤖", f"Subagente: {short(inp.get('description', ''), 60)}"),
        "Agent": ("🤖", f"Subagente: {short(inp.get('description', ''), 60)}"),
        "TodoWrite": ("✅", "Atualizando lista de tarefas"),
    }.get(tool, ("🛠️", tool))


# ---------- GitHub ----------

def repo_slug(cwd):
    try:
        url = subprocess.run(["git", "-C", cwd, "remote", "get-url", "origin"],
                             capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return None
    m = re.search(r"[:/]([^/:]+)/([^/]+?)(?:\.git)?/?$", url)
    return f"{m.group(1)}/{m.group(2)}" if m else None


def gh(args, payload=None):
    """Chama `gh api`. Se o GH_TOKEN do ambiente for inválido, tenta sem ele
    (no Claude Code na nuvem o proxy do git/GitHub já autentica)."""
    cmd = ["gh", "api", *args]
    data = json.dumps(payload) if payload is not None else None
    if data:
        cmd += ["--input", "-"]
    envs = [os.environ.copy()]
    if "GH_TOKEN" in os.environ or "GITHUB_TOKEN" in os.environ:
        e = os.environ.copy(); e.pop("GH_TOKEN", None); e.pop("GITHUB_TOKEN", None)
        envs.append(e)
    for env in envs:
        r = subprocess.run(cmd, input=data, capture_output=True, text=True, env=env, timeout=20)
        if r.returncode == 0:
            return json.loads(r.stdout or "null")
    raise RuntimeError(r.stderr)


def find_or_create_issue(slug):
    found = gh([f"repos/{slug}/issues?labels=claudelock&state=open&per_page=1"])
    if found:
        return found[0]["number"]
    created = gh([f"repos/{slug}/issues", "-X", "POST"], {
        "title": "ClaudeLock — feed ao vivo",
        "body": "Gerenciado automaticamente pelo ClaudeLock. Pode deixar aberta.",
        "labels": ["claudelock"],
    })
    return created["number"]


def feed_of(body):
    m = re.search(r"```json\s*(\{.*?\})\s*```", body or "", re.S)
    try:
        return json.loads(m.group(1)) if m else None
    except ValueError:
        return None


def create_comment(slug, issue):
    """Cria o comentário desta conversa e apaga feeds antigos do mesmo issue."""
    try:
        for c in gh([f"repos/{slug}/issues/{issue}/comments?per_page=100"]) or []:
            f = feed_of(c.get("body"))
            if f and time.time() - f.get("updated", 0) > OLD_FEED_SECONDS:
                gh([f"repos/{slug}/issues/comments/{c['id']}", "-X", "DELETE"])
    except Exception:
        pass
    return gh([f"repos/{slug}/issues/{issue}/comments", "-X", "POST"],
              {"body": "<!-- claudelock -->\nIniciando…"})["id"]


def load(state_path):
    with open(state_path, encoding="utf-8") as f:
        return json.load(f)


def save(state_path, st):
    tmp = state_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False)
    os.replace(tmp, state_path)


def update_state(state_path, **fields):
    with open(state_path + ".lock", "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        st = load(state_path)
        st.update(fields)
        save(state_path, st)


def flush(state_path):
    """Roda em segundo plano: envia o estado atual para o comentário da conversa.
    Um envio por vez; o estado só fica travado por instantes, então o hook
    (e o Claude) nunca esperam pela rede."""
    with open(state_path + ".flush", "w") as fl:
        fcntl.flock(fl, fcntl.LOCK_EX)
        time.sleep(0.4)  # agrupa eventos em rajada
        st = load(state_path)
        if st.get("sent") == st.get("rev"):
            return
        if not st.get("issue"):
            st["issue"] = find_or_create_issue(st["slug"])
            update_state(state_path, issue=st["issue"])
        if not st.get("comment"):
            st["comment"] = create_comment(st["slug"], st["issue"])
            update_state(state_path, comment=st["comment"])
        feed = {"session": st["session"], "project": st["project"], "title": st.get("title", ""),
                "updated": time.time(), "events": st["events"]}
        body = ("<!-- claudelock -->\nFeed ao vivo de uma conversa do Claude Code (ClaudeLock).\n\n"
                "```json\n" + json.dumps(feed, ensure_ascii=False) + "\n```")
        try:
            gh([f"repos/{st['slug']}/issues/comments/{st['comment']}", "-X", "PATCH"], {"body": body})
        except RuntimeError:
            update_state(state_path, comment=None)  # apagado à mão: cria outro na próxima
            raise
        update_state(state_path, sent=st["rev"])


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--flush":
        try:
            flush(sys.argv[2])
        except Exception as e:
            with open(sys.argv[2] + ".err", "w") as f:
                f.write(str(e))
        return

    d = json.load(sys.stdin)
    name = d.get("hook_event_name", "")
    cwd = d.get("cwd") or os.getcwd()
    ev = {"icon": "💬", "text": "", "said": "", "ts": time.time()}

    if name == "PreToolUse":
        ev["icon"], ev["text"] = describe(d.get("tool_name", ""), d.get("tool_input"))
        ev["said"] = short(last_assistant_text(d.get("transcript_path")), 400)
    elif name == "UserPromptSubmit":
        ev["icon"], ev["text"] = "🧑", "Você: " + short(d.get("prompt", ""), 200)
    elif name == "Notification":
        ev["icon"], ev["text"] = "🔔", short(d.get("message", "Precisa da sua atenção"), 200)
    elif name == "Stop":
        ev["icon"], ev["text"] = "✅", "Terminou"
        ev["said"] = short(last_assistant_text(d.get("transcript_path")), 600)
    else:
        return

    slug = repo_slug(cwd)
    if not slug:
        return
    session = re.sub(r"[^A-Za-z0-9_-]", "", str(d.get("session_id") or "sem-sessao"))[:64]
    os.makedirs(STATE_DIR, exist_ok=True)
    state_path = os.path.join(STATE_DIR, slug.replace("/", "__") + "__" + session + ".json")
    with open(state_path + ".lock", "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        try:
            st = load(state_path)
        except (OSError, ValueError):
            st = {"slug": slug, "session": session, "issue": None, "comment": None,
                  "events": [], "rev": 0, "sent": -1}
        ev["project"] = st["project"] = os.path.basename(cwd)
        if name == "UserPromptSubmit" and not st.get("title"):
            st["title"] = short(d.get("prompt", ""), 60)
        st["events"] = (st["events"] + [ev])[-MAX_EVENTS:]
        st["rev"] += 1
        save(state_path, st)

    # rede em segundo plano: o Claude Code não espera o GitHub
    subprocess.Popen([sys.executable, os.path.abspath(__file__), "--flush", state_path],
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                     stderr=subprocess.DEVNULL, start_new_session=True)


if __name__ == "__main__":
    main()
