from flask import Flask, render_template, request, jsonify
import os
## please install requirements.txt
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

from langchain_ollama import OllamaLLM

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

vector_db = None


# -------------------------
# Process PDFs (NO LLM HERE)
# -------------------------
def process_pdfs(paths):
    global vector_db

    docs = []

    for path in paths:
        loader = PyPDFLoader(path)
        docs.extend(loader.load())

    if not docs:
        raise Exception("No text found in PDFs")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150
    )

    chunks = splitter.split_documents(docs)

    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )

    vector_db = FAISS.from_documents(
        chunks,
        embeddings
    )

    print("PDFs indexed successfully")


# -------------------------
# Home
# -------------------------
@app.route("/")
def home():
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({
        "status": "ok"
    })


# -------------------------
# Upload PDFs
# -------------------------
@app.route("/upload", methods=["POST"])
def upload():
    try:
        files = request.files.getlist("pdfs")

        if not files or all(f.filename == "" for f in files):
            return jsonify({
                "success":False,
                "message":"No PDFs uploaded"
            }),400

        paths=[]

        for file in files:
            filepath=os.path.join(
                UPLOAD_FOLDER,
                file.filename
            )

            file.save(filepath)
            paths.append(filepath)
            print(f"Saved file: {filepath}")

        print("Starting PDF processing...")
        process_pdfs(paths)
        print("PDF processing completed successfully")

        return jsonify({
            "success":True,
            "message":"PDFs uploaded and indexed successfully"
        })

    except Exception as e:
        print("UPLOAD ERROR:", str(e))
        import traceback
        traceback.print_exc()

        return jsonify({
            "success":False,
            "message":f"Error: {str(e)}"
        }),500


# -------------------------
# Ask Questions
# -------------------------
@app.route("/ask", methods=["POST"])
def ask():
    try:
        global vector_db

        if vector_db is None:
            return jsonify({
                "success":False,
                "answer":"Upload PDFs first."
            }),400

        question=request.json.get("question","")

        if not question:
            return jsonify({
                "success":False,
                "answer":"Enter a question."
            }),400


        # Use tinyllama first (more stable)
        llm=OllamaLLM(
            model="phi3"
        )

        docs=vector_db.similarity_search(
            question,
            k=4
        )

        context="\n\n".join(
            d.page_content for d in docs
        )

        prompt=f"""
Use ONLY this context to answer.

Context:
{context}

Question:
{question}
"""

        answer=llm.invoke(prompt)

        return jsonify({
            "success":True,
            "answer":answer
        })

    except Exception as e:
        print("ASK ERROR:",e)

        return jsonify({
            "success":False,
            "answer":str(e)
        }),500


if __name__=="__main__":
    app.run(debug=True)
