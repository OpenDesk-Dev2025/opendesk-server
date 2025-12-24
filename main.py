from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Server របស់បងដំណើរការហើយ!", "status": "Online"}

@app.get("/chat")
def chat(text: str):
    # កន្លែងនេះបងអាចដោត API ពីក្រុមហ៊ុនផ្សេងៗចូលបានតាមចិត្ត
    return {"reply": f"បងបានសួរថា: {text}", "source": "Render Server"}
