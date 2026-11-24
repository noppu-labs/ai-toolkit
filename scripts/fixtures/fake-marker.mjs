#!/usr/bin/env node
// Stands in for a command that a hostile file name asks a tool to run. It only
// writes FAKE_MARKER_FILE, so a test can tell whether it ran.
import { writeFileSync } from "node:fs";

const file = process.env.FAKE_MARKER_FILE;
if (file) writeFileSync(file, "ran\n");
