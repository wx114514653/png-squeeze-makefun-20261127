# Lossless PNG Squeezer

An entry for the [make.fun PNG compression bounty](https://make.fun/bounty/png-squeeze-01-run-20261127). The program compresses the eight supplied screenshots while preserving every RGBA value, including the RGB values of fully transparent pixels.

## Approach

The encoder tests lossless PNG color types and palettes where applicable, multiple row filters (including per-row selection by distinct adjacent residual-byte pairs and a 20-bit hashed estimate of residual-byte triplets), and several Node.js zlib settings. It chooses the smallest valid output from a fixed set of candidates. It uses only Node.js built-in modules and does not access the network or install dependencies at runtime.

## Run

With Node.js 22, execute `node main.ts`. It reads `/input/i001/image.png` through `/input/i008/image.png` and writes the corresponding files under `/output`. For local testing, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` override these directories.

## Practice test

On the official practice set, the kit's `grade-local --driver process --commit <sha>` reported 703,640/1,000,000 with all eight images answered and exact pixels preserved. The L1 repeat reproduced byte-for-byte. With Node.js 22.23.5, the latest complete local grading command took 59.64 seconds, including checker and repeat-verification overhead; other local runs were about 60–61 seconds. A separate direct Node.js invocation encoding all eight images took 27.95 seconds when pinned to one available CPU and peaked at about 169 MiB RSS; an unpinned run took 27.62 seconds and peaked at about 160 MiB. The official one-CPU, 512-MB container and its Node.js 26.13.1 runtime were not available for verification, so these local results are not an official competition score or a prediction of placement.

## License

MIT; see [LICENSE](LICENSE).
