# Lossless PNG Squeezer

An entry for the [make.fun PNG compression bounty](https://make.fun/bounty/png-squeeze-01-run-20261127). The program compresses the eight supplied screenshots while preserving every RGBA value, including the RGB values of fully transparent pixels.

## Approach

The encoder tests lossless PNG color types and palettes where applicable, multiple row filters (including per-row selection by distinct adjacent residual-byte pairs), and several Node.js zlib settings. It chooses the smallest valid output from a fixed set of candidates. It uses only Node.js built-in modules and does not access the network or install dependencies at runtime.

## Run

With Node.js 22, execute `node main.ts`. It reads `/input/i001/image.png` through `/input/i008/image.png` and writes the corresponding files under `/output`. For local testing, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` override these directories.

## Practice test

On the official practice set, the kit's `grade-local --driver process --worktree` reported 702,423/1,000,000 with all eight images answered and exact pixels preserved. Two executions reproduced byte-for-byte. With Node.js 22.23.5, the complete local grading command took 51.15 seconds on this host. This used the non-container process driver; it is not an official competition score or a prediction of placement.

## License

MIT; see [LICENSE](LICENSE).
