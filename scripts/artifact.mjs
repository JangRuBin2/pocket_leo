// dist-single/index.html -> dist-single/pocket-leo.html (문서 뼈대 태그를 뺀 단일 파일)
import { readFileSync, writeFileSync } from 'node:fs';
let h = readFileSync('dist-single/index.html', 'utf8');
h = h
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?(html|head|body)[^>]*>/gi, '')
  .replace(/<meta[^>]*>/gi, '');
writeFileSync('dist-single/pocket-leo.html', h.trim() + '\n');
console.log('dist-single/pocket-leo.html', (h.length / 1024).toFixed(0) + 'KB');
