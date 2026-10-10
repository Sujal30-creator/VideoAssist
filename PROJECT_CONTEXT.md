# VideoAssist: Multimodal Temporal Event Retrieval and Evidence-Grounded Question Answering for IT Field-Service Videos

## Problem Statement
IT and network field service technicians frequently encounter complex issues that require extensive troubleshooting, cross-referencing manuals, or escalating to senior engineers. Documenting these interventions and extracting actionable insights from the field-service process is often tedious and inaccurate.

## Scope
VideoAssist is an AI-assisted video understanding system designed to process IT/network field-service operations videos. It analyzes video frames, speech transcripts, and visible equipment text (via OCR) to answer natural-language questions with precise evidence-grounding in the source video.

## Use Cases
- Router installation
- Router/network-device troubleshooting
- Device replacement

## Demo Architecture
The current prototype is a static frontend simulation to demonstrate the user experience:
- Frontend: Next.js + React + Tailwind CSS
- Data: Local mocked JSON objects mimicking the expected AI system outputs.
- No actual AI models or backend APIs are integrated yet.

## Future Real-AI Architecture
- **Backend API**: FastAPI (Python)
- **Speech-to-Text**: Whisper
- **Visual Analysis & OCR**: Vision-Language Models (VLMs), dedicated OCR tools
- **Indexing & Retrieval**: FAISS, Vector DB (e.g., Pinecone), PostgreSQL
- **Orchestration**: LangChain/LlamaIndex for reasoning and evidence grounding

## Technology Stack
- Next.js (App Router)
- TypeScript
- React
- Tailwind CSS
- Lucide React (Icons)

## Important Constraints
- ONLY a demo prototype at this stage.
- NO expensive real AI pipelines.
- NO foundation model training.
- NOT for surveillance, face recognition, or autonomous network diagnosis.
