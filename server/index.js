import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const partDir = path.join(here, 'parts');
const files = fs.readdirSync(partDir).filter(name => /^part-\d+\.txt$/.test(name)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const source = files.map(name => fs.readFileSync(path.join(partDir, name), 'utf8')).join('');
// Parts are stored separately only to keep GitHub deployment atomic through the available connector.
// They are concatenated before parsing; the runtime is identical to a single source file.
new Function('express', 'cors', 'pg', source)(express, cors, pg);
