#!/bin/bash -eu
cd "$SRC/ai-toolkit"
npm install
compile_javascript_fuzzer ai-toolkit fuzz/skills_sync_fuzzer.js
