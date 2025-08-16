from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import shutil
import os
import json

app = FastAPI()

# Serve static files (CSS, JS, images, uploads, index.html, etc.)
app.mount("/static", StaticFiles(directory="static"), name="static")

UPLOAD_FOLDER = "static/uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

DATA_FILE = "memories.json"


# ---------------- Serve index.html ---------------- #
@app.get("/")
async def read_index():
    return FileResponse("static/index.html")


# ---------------- Add Text ---------------- #
@app.post("/add_text")
async def add_text(text: str = Form(...)):
    memory = {"type": "text", "content": text}
    save_memory(memory)
    return {"status": "success", "message": "Text added!"}


# ---------------- Add Image ---------------- #
@app.post("/add_image")
async def add_image(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    memory = {"type": "image", "content": f"/static/uploads/{file.filename}"}
    save_memory(memory)
    return {"status": "success", "message": "Image added!"}


# ---------------- Add Audio ---------------- #
@app.post("/add_audio")
async def add_audio(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    memory = {"type": "audio", "content": f"/static/uploads/{file.filename}"}
    save_memory(memory)
    return {"status": "success", "message": "Audio added!"}


# ---------------- Save Memory ---------------- #
def save_memory(memory):
    memories = []
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r") as f:
            memories = json.load(f)
    memories.append(memory)
    with open(DATA_FILE, "w") as f:
        json.dump(memories, f, indent=4)
