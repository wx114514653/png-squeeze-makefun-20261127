# Lossless PNG Squeezer

An entry for the [make.fun PNG compression bounty](https://make.fun/bounty/png-squeeze-01-run-20261127). The program compresses the eight supplied screenshots while preserving every RGBA value, including the RGB values of fully transparent pixels.

## Approach

The encoder tests lossless PNG color types and palettes where applicable, multiple row filters, and several Node.js zlib settings. It chooses the smallest valid output from a fixed set of candidates. It uses only Node.js built-in modules and does not access the network or install dependencies at runtime.

## Run

With Node.js 22, execute `node main.ts`. It reads `/input/i001/image.png` through `/input/i008/image.png` and writes the corresponding files under `/output`. For local testing, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` override these directories.

## Practice test

On the official practice set, the kit's `grade-local --driver process` reported a score of 699,867/1,000,000 with all eight images answered and exact pixels preserved. Two executions reproduced byte-for-byte. This is a local, non-container practice result, not an official competition score or a prediction of placement.

## License

MIT; see [LICENSE](LICENSE).
