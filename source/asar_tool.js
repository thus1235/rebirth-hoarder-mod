// asar_tool.js - list/extract files from an Electron asar archive
// usage:
//   node asar_tool.js list <archive> [filter]      -> print file list (path\tsize)
//   node asar_tool.js extract <archive> <inpath> <outfile>
//   node asar_tool.js find <archive> <regex>       -> print matching paths
const fs = require('fs');

function openHeader(archive) {
  const fd = fs.openSync(archive, 'r');
  const sizeBuf = Buffer.alloc(8);
  if (fs.readSync(fd, sizeBuf, 0, 8, null) !== 8) throw new Error('short header');
  const headerSize = sizeBuf.readUInt32LE(4); // size of the header pickle
  const pickle = Buffer.alloc(headerSize);
  if (fs.readSync(fd, pickle, 0, headerSize, 8) !== headerSize) throw new Error('short pickle');
  const strLen = pickle.readUInt32LE(4); // pickle: [4B payloadSize][4B strLen][string]
  const jsonText = pickle.slice(8, 8 + strLen).toString('utf8');
  const header = JSON.parse(jsonText);
  const dataStart = 8 + headerSize;
  return { fd, header, dataStart };
}

function walk(node, prefix, out) {
  for (const name of Object.keys(node.files || {})) {
    const child = node.files[name];
    const p = prefix ? prefix + '/' + name : name;
    if (child.files) walk(child, p, out);
    else if (typeof child.offset === 'string') {
      out.push({ path: p, size: child.size, offset: parseInt(child.offset, 10) });
    }
  }
}

const cmd = process.argv[2];
const archive = process.argv[3];
const { fd, header, dataStart } = openHeader(archive);
const files = [];
walk(header, '', files);

if (cmd === 'list') {
  const filter = process.argv[4];
  for (const f of files) {
    if (!filter || f.path.includes(filter)) console.log(`${f.size}\t${f.path}`);
  }
  console.error(`TOTAL FILES: ${files.length}`);
} else if (cmd === 'find') {
  const re = new RegExp(process.argv[4]);
  for (const f of files) if (re.test(f.path)) console.log(`${f.size}\t${f.path}`);
} else if (cmd === 'extract') {
  const inpath = process.argv[4];
  const outfile = process.argv[5];
  const f = files.find((x) => x.path === inpath);
  if (!f) { console.error('not found: ' + inpath); process.exit(1); }
  const buf = Buffer.alloc(f.size);
  let pos = 0;
  while (pos < f.size) {
    const n = fs.readSync(fd, buf, pos, f.size - pos, dataStart + f.offset + pos);
    if (n <= 0) throw new Error('read fail');
    pos += n;
  }
  fs.writeFileSync(outfile, buf);
  console.error(`extracted ${f.size} bytes -> ${outfile}`);
} else {
  console.error('unknown cmd');
  process.exit(1);
}
