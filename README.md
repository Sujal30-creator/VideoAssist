# VideoAssist: Multimodal Temporal Event Retrieval & Evidence-Grounded QA

## Project Objective
VideoAssist is an AI-assisted video understanding system designed for IT/network field-service operations. The system processes multimodal inputs (video frames, speech transcripts, and OCR text) to automatically segment and retrieve relevant operational events, and provide grounded answers to natural language questions based on explicit evidence.

**⚠️ IMPORTANT DEMO PROTOTYPE NOTICE ⚠️**  
> This is a demonstration prototype. The current AI pipeline uses simulated/mock inference data to demonstrate the User Experience, UI flow, and temporal reasoning logic. It does not actively process live videos using neural networks in this version.

## Architecture
The simulated pipeline flows through the following stages:
1. **Video Preprocessing**: Extracting frames and audio.
2. **Multimodal Analysis**: Processing Visual (frames), Speech (transcripts), and Text (OCR).
3. **Temporal Segmentation**: Chunking continuous video into logical operational events.
4. **Multimodal Indexing**: Creating a searchable semantic index.
5. **Query Understanding**: Parsing intent, target events, and temporal anchors.
6. **Coarse Retrieval & Fine Grounding**: Locating the general segment and extracting precise start/end bounds.
7. **Evidence Verification & QA**: Validating the multimodal evidence and outputting a grounded answer (or abstaining if out of scope).

## Technology Stack
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Architecture**: Component-based React Server/Client Architecture

## How to Run
To run the demo application locally:

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Demo Workflow
1. **Start Analysis**: Click "Analyze Video" to kick off the simulated processing pipeline.
2. **Explore Timeline**: Once complete, interact with the timeline to view generated temporal events, visual/OCR/speech evidence, and temporal relationships.
3. **Run Guided Demo**: In the "Ask VideoAssist" panel, click "Run Guided Demo" to automatically execute an end-to-end query retrieval process.
4. **Manual QA**: Click any of the preset questions or type your own (e.g. "Who is the technician?" to test the abstention mechanism).

## Mocked Components
- **Video Processing**: Pipeline progression is simulated via timeouts in `page.tsx`.
- **Inference Engine**: Replaced with deterministic rules in `SearchPanel.tsx`.
- **Database/Vector Store**: Replaced with statically typed mock arrays in `src/data/mockData.ts`.

## Future Integration (Real AI Implementation)
The next phase of the project will replace the simulation layer with real model inference:
- **Whisper**: Audio transcription and speaker diarization.
- **PaddleOCR**: Reading text from screens and equipment labels.
- **YOLO-class detector / CLIP / SigLIP**: Zero-shot or fine-tuned object detection and visual feature extraction.
- **Video-capable VLM (e.g., Gemini 1.5 Pro / LLaVA)**: Dense video captioning and reasoning.
- **Sentence Transformers**: Semantic embedding generation.
- **FAISS**: Vector indexing and fast similarity search.
- **PostgreSQL**: Structured metadata and relational storage.
- **FastAPI**: Python-based inference backend to interface with the Next.js frontend.
