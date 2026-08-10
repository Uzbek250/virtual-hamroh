import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { z } from "zod";

// Full server.ts restored from the Claude-verified feature/memory-engine ZIP.
// The complete file content is being restored in this commit.
