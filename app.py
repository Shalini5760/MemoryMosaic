from fastapi import FastAPI, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
import shutil
import json

app = FastAPI(title="Memory Mosaic Scramble")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure folders exist
os.makedirs("static", exist_ok=True)
os.makedirs("uploads/images", exist_ok=True)
os.makedirs("uploads/audio", exist_ok=True)

# Mount static + uploads
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

DATA_FILE = "memories.json"

# ---------- Helpers ----------
def load_memories():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("memories", data) if isinstance(data, dict) else data
        except Exception:
            return []
    return []

def save_memories(memories):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump({"memories": memories}, f, ensure_ascii=False, indent=2)

memories = load_memories()

class NewText(BaseModel):
    content: str

class NewImage(BaseModel):
    url: str

# ---------- Routes ----------
@app.get("/", response_class=HTMLResponse)
def home():
    index_path = os.path.join("static", "index.html")
    if not os.path.exists(index_path):
        return HTMLResponse("<h1>Put your index.html inside /static/index.html</h1>", status_code=404)
    return FileResponse(index_path, media_type="text/html")

@app.get("/api/memories")
def get_memories():
    return {"memories": list(reversed(memories[-50:]))}

@app.post("/api/add-text")
def add_text(item: NewText):
    new_id = (max([m.get("id", 0) for m in memories], default=0) + 1)
    mem = {"id": new_id, "type": "text", "content": item.content}
    memories.append(mem)
    save_memories(memories)
    return {"status": "ok", "id": new_id}

@app.post("/api/add-image")
def add_image(item: NewImage):
    new_id = (max([m.get("id", 0) for m in memories], default=0) + 1)
    mem = {"id": new_id, "type": "image", "url": item.url}
    memories.append(mem)
    save_memories(memories)
    return {"status": "ok", "id": new_id}

@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    file_path = os.path.join("uploads/images", file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    url = f"/uploads/images/{file.filename}"

    new_id = (max([m.get("id", 0) for m in memories], default=0) + 1)
    mem = {"id": new_id, "type": "image", "url": url}
    memories.append(mem)
    save_memories(memories)

    return {"status": "ok", "id": new_id, "url": url}

@app.post("/api/upload-audio")
async def upload_audio(file: UploadFile = File(...)):
    file_path = os.path.join("uploads/audio", file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    url = f"/uploads/audio/{file.filename}"

    new_id = (max([m.get("id", 0) for m in memories], default=0) + 1)
    mem = {"id": new_id, "type": "audio", "url": url}
    memories.append(mem)
    save_memories(memories)

    return {"status": "ok", "id": new_id, "url": url}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)
