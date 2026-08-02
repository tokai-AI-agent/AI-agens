import fs from 'node:fs/promises';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const ROOT = 'C:/Users/hanab/OneDrive/デスクトップ/旅行エージェントfile/AI-agens';
const OUT = `${ROOT}/Travel_AI_Agent_紹介スライド.pptx`;
const ASSET = `${ROOT}/.tmp/travel-deck`;
const W = 1280, H = 720;
const C = { ink:'#101820', blue:'#2F80ED', cyan:'#56CCF2', pale:'#EAF5FB', gray:'#EEF1F4', mid:'#66717D', white:'#FFFFFF', orange:'#F2994A' };

const deck = Presentation.create({ slideSize:{ width:W, height:H } });
async function bytes(path){ const b=await fs.readFile(path); return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength); }
function box(slide, name, x,y,w,h, fill='none', lineFill='none', radius=false){
  return slide.shapes.add({ geometry:radius?'roundRect':'rect', name, position:{left:x,top:y,width:w,height:h}, fill, line:{style:'solid',fill:lineFill,width:lineFill==='none'?0:1}, ...(radius?{borderRadius:'rounded-xl'}:{}) });
}
function txt(slide,name,text,x,y,w,h,size=24,color=C.ink,bold=false,align='left'){
  const s=box(slide,name,x,y,w,h,'none'); s.text=text; s.text.style={fontSize:size,typeface:'Yu Gothic',color,bold,alignment:align,verticalAlignment:'top'}; s.text.insets={left:0,right:0,top:0,bottom:0}; return s;
}
async function pic(slide,name,path,x,y,w,h,fit='cover'){
  return slide.images.add({name,blob:await bytes(path),contentType:'image/png',alt:name,fit,position:{left:x,top:y,width:w,height:h},geometry:'roundRect',borderRadius:'rounded-xl'});
}
function rule(slide,x,y,w,color=C.ink){ box(slide,'rule',x,y,w,2,color); }
function footer(slide,n){ txt(slide,'footer',String(n).padStart(2,'0'),1180,670,60,22,14,C.mid,false,'right'); }
function notes(slide, sources=''){ slide.speakerNotes.textFrame.setText(`[Sources]\n- ${sources || 'ローカルWebアプリの実行画面（本プロジェクト）'}\n[/Sources]`); }

// 1 — sparse cover, adapted from Codex Grid slide 01.
{
 const s=deck.slides.add(); s.background.fill=C.white;
 txt(s,'eyebrow','TRAVEL AI AGENT',42,42,450,44,25,C.blue,true);
 txt(s,'title','「行きたい」が\n2分で旅程になる。',42,150,710,230,65,C.ink,true);
 txt(s,'subtitle','AIと会話するだけで、時間・食・写真・移動まで。\n旅行計画の「面倒」を、「楽しい」に変えるWebアプリ。',42,455,660,115,25,C.mid,false);
 await pic(s,'actual-plan',`${ASSET}/plan-main.png`,790,86,440,550,'cover');
 box(s,'accent',760,86,8,550,C.cyan); notes(s); 
}

// 2 — three-beat journey, adapted from Codex Grid slide 17.
{
 const s=deck.slides.add(); s.background.fill=C.white;
 txt(s,'title','旅行計画は、3つの会話で動き出す',42,36,1196,72,39,C.ink,true);
 rule(s,42,350,1196,C.ink);
 const xs=[42,450,858], labels=['01  条件を話す','02  AIが調べる','03  旅程が現れる'];
 const bodies=['京都・1泊2日\n予算5万円\n観光＋グルメ＋写真映え','Web情報を参照し\nスポット・移動・滞在時間を\nひとつのプランに','タイムライン\nルート地図\nおすすめ情報'];
 xs.forEach((x,i)=>{box(s,`dot${i}`,x,344,12,12,C.blue);txt(s,`lab${i}`,labels[i],x,292,320,34,21,C.blue,true);txt(s,`body${i}`,bodies[i],x,400,330,150,28,C.ink,i===2);});
 txt(s,'caption','入力フォームではなく、会話のテンポで条件が整う。',42,610,900,44,23,C.mid,false); footer(s,2); notes(s);
}

// 3 — half text / half image, adapted from Codex Grid slide 08.
{
 const s=deck.slides.add(); s.background.fill=C.white;
 txt(s,'title','「京都に行きたい」の先まで、AIが書き込む',42,36,1196,70,39,C.ink,true);
 txt(s,'big','王道観光\n×\n写真映え\n×\n京グルメ',42,170,480,310,48,C.ink,true);
 txt(s,'small','東京発・1泊2日・1人5万円。\nテーマがヒーロー画面になり、\n旅のムードが一目で伝わる。',42,510,520,105,23,C.mid,false);
 await pic(s,'overview-screen',`${ASSET}/plan-main.png`,650,125,590,510,'cover'); footer(s,3); notes(s);
}

// 4 — screenshot-led evidence slide.
{
 const s=deck.slides.add(); s.background.fill=C.white;
 txt(s,'title','朝7:30から、旅が“映画”のように進む',42,36,1196,70,39,C.ink,true);
 await pic(s,'timeline-screen',`${ASSET}/plan-timeline.png`,42,138,780,520,'cover');
 txt(s,'callout1','07:30\n東京駅を出発',870,155,310,95,30,C.blue,true);
 txt(s,'callout2','10:30\n東寺の五重塔へ',870,285,310,95,30,C.ink,true);
 txt(s,'callout3','13:30\n清水寺から産寧坂へ',870,415,330,95,30,C.ink,true);
 txt(s,'caption','時刻・所要時間・移動手段・住所・写真を、\n計画ではなく「体験の流れ」として見せる。',870,555,340,82,22,C.mid,false); footer(s,4); notes(s);
}

// 5 — map evidence.
{
 const s=deck.slides.add(); s.background.fill=C.white;
 txt(s,'title','9スポットが、地図の上で「行けそう」に変わる',42,36,1196,70,39,C.ink,true);
 await pic(s,'map-screen',`${ASSET}/plan-map.png`,42,135,760,520,'cover');
 txt(s,'stat','9',870,150,260,120,88,C.blue,true);
 txt(s,'stat-label','訪問スポット',875,267,300,42,25,C.ink,true);
 txt(s,'detail','1日目と2日目を色分け。\n訪問順と移動の距離感が、\nプランと同じ画面で分かる。',875,340,330,125,25,C.ink,false);
 txt(s,'meaning','「これ、本当に回れる？」\nという不安を、地図が消す。',875,520,330,90,28,C.orange,true); footer(s,5); notes(s,'ローカルWebアプリの実行画面／地図: OpenStreetMap contributors');
}

// 6 — three cards, adapted from Codex Grid slide 18.
{
 const s=deck.slides.add(); s.background.fill=C.white;
 txt(s,'title','完成が終点じゃない。一言で、旅は何度でも変わる',42,36,1196,75,39,C.ink,true);
 const xs=[42,453,865], heads=['もっとゆっくり','グルメ多めに','雨の日向けに'];
 const bodies=['早朝出発を緩め、\n滞在時間を長く。\n「詰め込みすぎ」を解消。','おばんざい、京スイーツ、\nカフェ休憩を追加。\n旅の記憶に味を足す。','屋内で楽しめる文化施設と\n移動の少ないルートへ。\n天気で旅を諦めない。'];
 xs.forEach((x,i)=>{box(s,`card${i}`,x,150,375,365,i===1?C.pale:C.gray,'none',true);txt(s,`num${i}`,`0${i+1}`,x+30,180,70,42,24,C.blue,true);txt(s,`head${i}`,heads[i],x+30,245,315,55,29,C.ink,true);txt(s,`body${i}`,bodies[i],x+30,330,315,140,22,C.mid,false);});
 rule(s,42,560,1196,C.ink); txt(s,'bottom','再生成ではなく、対話を続ける。',42,600,900,48,30,C.ink,true); footer(s,6); notes(s);
}

// 7 — close, adapted from Codex Grid slide 26.
{
 const s=deck.slides.add(); s.background.fill=C.white;
 txt(s,'eyebrow','TRAVEL AI AGENT',42,42,450,44,25,C.blue,true);
 txt(s,'title','旅の予定表ではなく、\n旅の始まりをつくる。',42,170,1000,210,62,C.ink,true);
 txt(s,'close','会話する。見える。直せる。\nだから、計画の時間から旅行は楽しい。',42,520,650,95,27,C.mid,false);
 box(s,'blue-block',980,0,300,720,C.blue); txt(s,'mark','✈',1040,220,170,160,96,C.white,true,'center'); notes(s);
}

for (const [i,s] of deck.slides.items.entries()) {
  const png=await deck.export({slide:s,format:'png',scale:1}); await fs.writeFile(`${ASSET}/slide-${i+1}.png`,new Uint8Array(await png.arrayBuffer()));
  const layout=await s.export({format:'layout'}); await fs.writeFile(`${ASSET}/slide-${i+1}.layout.json`,await layout.text());
}
const pptx=await PresentationFile.exportPptx(deck); await pptx.save(OUT);
console.log(OUT);
