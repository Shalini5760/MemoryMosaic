import React, { useEffect, useMemo, useState } from "react";

const API = "http://localhost:5000";

export default function App() {
  const [username, setUsername] = useState("player1");
  const [token, setToken] = useState(localStorage.getItem("mm_token") || "");
  const [me, setMe] = useState(null);
  const [balance, setBalance] = useState(0);
  const [feed, setFeed] = useState([]);
  const [newText, setNewText] = useState("My first solo trip to the mountains.");
  const [newImageUrl, setNewImageUrl] = useState("https://picsum.photos/800/600");
  const authHeaders = useMemo(() => token ? { Authorization: `Bearer ${token}` } : {}, [token]);

  // --- Auth ---
  async function registerOrLogin(u) {
    try {
      let r = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u })
      });
      let data = await r.json();
      if (!r.ok && data?.error === "username taken") {
        const lr = await fetch(`${API}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u })
        });
        data = await lr.json();
      }
      if (data?.token) {
        setToken(data.token);
        localStorage.setItem("mm_token", data.token);
        setMe(data.user);
      }
    } catch (e) {
      alert("Auth failed: " + e.message);
    }
  }

  // --- API helpers ---
  async function loadMe() {
    const r = await fetch(`${API}/me`, { headers: authHeaders });
    const d = await r.json();
    if (d?.user) setMe(d.user);
  }
  async function loadWallet() {
    const r = await fetch(`${API}/wallet`, { headers: authHeaders });
    const d = await r.json();
    setBalance(d?.balance || 0);
  }
  async function loadFeed() {
    const r = await fetch(`${API}/feed`, { headers: authHeaders });
    const d = await r.json();
    setFeed(d?.memories || []);
  }

  // --- Create memories ---
  async function createTextMemory() {
    const r = await fetch(`${API}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ type: "text", title: "Trip", description: "demo", data: newText, tags: ["travel"] })
    });
    const d = await r.json();
    if (!r.ok) return alert(d?.error || "Failed creating memory");
    await loadFeed();
    alert("Text memory created!");
  }

  async function createImageMemory() {
    const r = await fetch(`${API}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ type: "image", title: "Photo", description: "demo", data: newImageUrl, tags: ["photo"] })
    });
    const d = await r.json();
    if (!r.ok) return alert(d?.error || "Failed creating memory");
    await loadFeed();
    alert("Image memory created!");
  }

  // --- Create puzzle from a memory ---
  async function createPuzzle(memoryId, mode = "text_blanks", difficulty = 2) {
    const r = await fetch(`${API}/puzzles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ memoryId, mode, difficulty })
    });
    const d = await r.json();
    if (!r.ok) return alert(d?.error || "Failed creating puzzle");
    alert(`Puzzle created (${mode}). Open console -> see /puzzles/:id to play.\nPuzzle ID: ${d.puzzle.id}`);
    return d.puzzle;
  }

  // --- Attempt helpers for quick demo ---
  async function quickSolveText(puzzleId) {
    // naive demo: try each blank with its first choice == answer (we don't know answers on client, this is just to show progress calls work)
    const r = await fetch(`${API}/puzzles/${puzzleId}`, { headers: authHeaders });
    const d = await r.json();
    const blanks = d?.puzzle?.board?.blanks || [];
    for (let i = 0; i < blanks.length; i++) {
      const choice = blanks[i].choices[0]; // demo only
      // try 3 choices to show delta/progress changes
      for (const c of blanks[i].choices) {
        const rr = await fetch(`${API}/puzzles/${puzzleId}/attempt`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ blankIdx: i, choice: c })
        });
        const res = await rr.json();
        console.log("attempt", i, c, res);
        if (res.progress === 100) break;
      }
    }
    await loadWallet();
  }

  async function quickSwapImage(puzzleId) {
    const r = await fetch(`${API}/puzzles/${puzzleId}`, { headers: authHeaders });
    const d = await r.json();
    const tiles = d?.puzzle?.board?.tiles || [];
    // do a few swaps randomly just to demonstrate server progress responses
    for (let k = 0; k < Math.min(10, tiles.length); k++) {
      const from = Math.floor(Math.random() * tiles.length);
      const to = Math.floor(Math.random() * tiles.length);
      const rr = await fetch(`${API}/puzzles/${puzzleId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ from, to })
      });
      const res = await rr.json();
      console.log("swap", from, to, res);
      if (res.progress === 100) break;
    }
    await loadWallet();
  }

  useEffect(() => {
    if (!token) registerOrLogin(username);
  }, []);

  useEffect(() => {
    if (!token) return;
    loadMe();
    loadWallet();
    loadFeed();
  }, [token]);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1>🧩 Memory Mosaic</h1>
      {!token ? (
        <div>
          <input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="username" />
          <button onClick={()=>registerOrLogin(username)}>Sign in</button>
        </div>
      ) : (
        <>
          <p>Logged in as <b>{me?.username}</b> • Tokens: <b>{balance}</b></p>

          <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <h3>Create Text Memory</h3>
            <textarea rows={3} style={{ width: "100%" }} value={newText} onChange={(e)=>setNewText(e.target.value)} />
            <button onClick={createTextMemory} style={{ marginTop: 8 }}>Create</button>
          </section>

          <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <h3>Create Image Memory</h3>
            <input style={{ width: "100%" }} value={newImageUrl} onChange={(e)=>setNewImageUrl(e.target.value)} />
            <div style={{ marginTop: 8 }}><button onClick={createImageMemory}>Create</button></div>
          </section>

          <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
            <h3>Feed (latest 50)</h3>
            {feed.length === 0 ? <p>No memories yet.</p> : (
              <ul style={{ listStyle: "none", padding: 0 }}>
                {feed.map((m)=>(
                  <li key={m.id} style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ fontWeight: 600, minWidth: 80 }}>{m.type.toUpperCase()}</div>
                      <div style={{ flex: 1 }}>
                        {m.type === "text" ? <span>{m.data}</span> :
                          <img src={m.data} alt={m.title} style={{ maxWidth: 240, borderRadius: 6 }} />}
                      </div>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {m.type === "text" && (
                        <button onClick={async ()=>{
                          const p = await createPuzzle(m.id, "text_blanks", 2);
                          if (p) await quickSolveText(p.id); // demo attempts
                        }}>Create & Demo Solve: Text Blanks</button>
                      )}
                      {m.type === "image" && (
                        <button onClick={async ()=>{
                          const p = await createPuzzle(m.id, "image_scramble", 2);
                          if (p) await quickSwapImage(p.id); // demo swaps
                        }}>Create & Demo: Image Scramble</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
