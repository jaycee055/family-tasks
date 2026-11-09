#!/usr/bin/env python3
"""Builds index.html and backend/Code.gs from src/ (the shared logic lives in src/core.js)."""
import pathlib
root = pathlib.Path(__file__).parent
core = (root / 'src/core.js').read_text()
for src, dst in [('src/app.html', 'index.html'), ('src/gas.js', 'backend/Code.gs')]:
    text = (root / src).read_text()
    assert '/*CORE*/' in text, src
    (root / dst).write_text(text.replace('/*CORE*/', core))
    print('built', dst)
