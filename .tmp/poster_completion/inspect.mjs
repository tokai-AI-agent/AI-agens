import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const root = "C:/Users/hanab/OneDrive/デスクトップ/旅行エージェントfile/AI-agens/.tmp/poster_completion";
const source = path.join(root, "source.pptx");
const out = path.join(root, "manual-inspect");
await fs.mkdir(out, { recursive: true });
const deck = await PresentationFile.importPptx(await FileBlob.load(source));
const snapshot = await deck.inspect({
  kind: "deck,slide,textbox,shape,image,table,chart,notes,layout",
  include: "id,slide,name,title,text,textPreview,textChars,textLines,bbox,bboxUnit,isPlaceholder,placeholders,rows,cols,chartType,alt",
  maxChars: 100000,
});
await fs.writeFile(path.join(out, "inspect.ndjson"), snapshot.ndjson, "utf8");
for (let i = 0; i < deck.slides.items.length; i++) {
  const slide = deck.slides.items[i];
  const png = await slide.export({ format: "png", scale: 1 });
  await fs.writeFile(path.join(out, `slide-${i + 1}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(path.join(out, `slide-${i + 1}.json`), JSON.stringify(layout, null, 2), "utf8");
}
console.log(`slides=${deck.slides.items.length}`);
