// 블록 → 한글 문서(.hwpx, OWPML) — 의존성 없이 직접 만든다 (DEC-025). 한컴오피스 한글 2022에서 서식 14종이 열리고 글자가 같은 것을 확인했다 (2026-11-18).
// 구조는 한글 문서 표준(OWPML)을 따른다: 글자는 <hp:run><hp:t>, 쪽 설정(secPr)은 첫 문단의 첫 run 안,
// 패키지 첫 항목은 무압축 mimetype("application/hwp+zip"). 뼈대는 hwpx-mcp-server가 만든 빈 문서 구조와 같게 맞췄다.
// (이전에 쓰던 hwpx-js는 글자를 비표준 <hp:runText>에 넣어 한글·hwpx 도구에서 빈 문서로 읽혔다.)
// 브라우저 안에서만 만들어 내려받는다 (이름·주소·금액이 서버로 가지 않는다).
import type { Block, BlockKind } from "../fill";
import { xmlEscape } from "./docx";
import { zipStore } from "./zip";

export const HWPX_MIME = "application/hwp+zip";

const NS =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';
const LANGS = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"] as const;
const FONT = "함초롬바탕";

/** 글자 모양: 0 본문 11pt, 1 제목 18pt 굵게, 2 소제목 12pt 굵게 */
const CHAR = { text: 0, title: 1, heading: 2 } as const;
/** 문단 모양: 0 왼쪽, 1 가운데, 2 오른쪽 */
const PARA = { left: 0, center: 1, right: 2 } as const;

const LOOK: Record<BlockKind, { char: number; para: number }> = {
  title: { char: CHAR.title, para: PARA.center },
  heading: { char: CHAR.heading, para: PARA.center },
  center: { char: CHAR.text, para: PARA.center },
  right: { char: CHAR.text, para: PARA.right },
  text: { char: CHAR.text, para: PARA.left },
  blank: { char: CHAR.text, para: PARA.left },
};

const langAttrs = (v: string | number) => LANGS.map((l) => `${l.toLowerCase()}="${v}"`).join(" ");

function charPr(id: number, height: number, bold: boolean): string {
  return (
    `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">` +
    `<hh:fontRef ${langAttrs(0)}/><hh:ratio ${langAttrs(100)}/><hh:spacing ${langAttrs(0)}/>` +
    `<hh:relSz ${langAttrs(100)}/><hh:offset ${langAttrs(0)}/>${bold ? "<hh:bold/>" : ""}</hh:charPr>`
  );
}

function paraPr(id: number, align: "LEFT" | "CENTER" | "RIGHT"): string {
  const margin =
    '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>' +
    '<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>';
  return (
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="AUTO">` +
    `<hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>` +
    '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>' +
    '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>' +
    `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin}</hp:case><hp:default>${margin}</hp:default></hp:switch>` +
    '<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>'
  );
}

const borderFill = (id: number) =>
  `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE"/><hh:backSlash type="NONE"/>` +
  ["left", "right", "top", "bottom"]
    .map((s) => `<hh:${s}Border type="NONE" width="0.1mm" color="#000000"/>`)
    .join("") +
  '<hh:diagonal type="NONE" width="0.1mm" color="#000000"/></hh:borderFill>';

export function headerXml(): string {
  const fontfaces = LANGS.map(
    (l) =>
      `<hh:fontface lang="${l}" fontCnt="1"><hh:font id="0" face="${FONT}" type="TTF"/></hh:fontface>`,
  ).join("");
  return (
    `${XML}<hh:head ${NS} version="1.1" secCnt="1">` +
    '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>' +
    `<hh:fontfaces itemCnt="${LANGS.length}">${fontfaces}</hh:fontfaces>` +
    `<hh:borderFills itemCnt="1">${borderFill(1)}</hh:borderFills>` +
    `<hh:charProperties itemCnt="3">${charPr(CHAR.text, 1100, false)}${charPr(CHAR.title, 1800, true)}${charPr(CHAR.heading, 1200, true)}</hh:charProperties>` +
    '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>' +
    '<hh:numberings itemCnt="0"/><hh:bullets itemCnt="0"/>' +
    `<hh:paraProperties itemCnt="3">${paraPr(PARA.left, "LEFT")}${paraPr(PARA.center, "CENTER")}${paraPr(PARA.right, "RIGHT")}</hh:paraProperties>` +
    '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Body" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langId="1042" lockForm="0"/></hh:styles>' +
    '<hh:memoProperties itemCnt="0"/></hh:refList><hh:compatibleDocument targetProgram="HWP201X"/>' +
    '<hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption><hh:trackChangeConfig flags="0"/></hh:head>'
  );
}

/** A4, 여백(HWPUNIT, 1mm ≈ 283.46) — 왼쪽·오른쪽 25mm, 위 30mm, 아래 25mm */
const SEC_PR =
  '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">' +
  '<hp:grid lineGrid="0" charGrid="0" wongoji="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>' +
  '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>' +
  '<hp:pagePr landscape="0" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:pageMar header="4252" footer="4252" left="7087" right="7087" top="8504" bottom="7087" gutter="0"/></hp:pagePr>' +
  '<hp:footNotePr><hp:autoNumFormat type="DIGIT"/><hp:noteLine length="-1" type="SOLID" width="0.12mm" color="#000000"/><hp:noteSpacing aboveLine="850" belowLine="567" betweenNotes="283"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>' +
  '<hp:endNotePr><hp:autoNumFormat type="DIGIT"/><hp:noteLine length="14692" type="SOLID" width="0.12mm" color="#000000"/><hp:noteSpacing aboveLine="850" belowLine="567" betweenNotes="0"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>' +
  "</hp:secPr>";

const para = (id: number, b: Block, prefix = "") => {
  const look = LOOK[b.kind];
  // 문단 안의 줄바꿈은 한글의 강제 줄 나눔으로 (한글 2022에서 확인)
  const text = b.kind === "blank" ? "" : b.text.split("\n").map(xmlEscape).join("<hp:lineBreak/>");
  return (
    `<hp:p id="${id}" paraPrIDRef="${look.para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="${look.char}">${prefix}<hp:t>${text}</hp:t></hp:run></hp:p>`
  );
};

export function sectionXml(blocks: readonly Block[]): string {
  const list = blocks.length ? blocks : [{ kind: "blank", text: "" } as Block];
  // 쪽 설정은 첫 문단의 첫 run 안에 둔다 (한글 표준 위치)
  const body = list.map((b, i) => para(i, b, i === 0 ? SEC_PR : "")).join("");
  return `${XML}<hs:sec ${NS}>${body}</hs:sec>`;
}

function contentHpf(title: string): string {
  return (
    `${XML}<opf:package ${NS} version="" unique-identifier="" id="">` +
    `<opf:metadata><opf:title>${xmlEscape(title)}</opf:title><opf:language>ko</opf:language>` +
    '<opf:meta name="creator" content="text">햄찌법원</opf:meta></opf:metadata>' +
    '<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>' +
    '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>' +
    '<opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>' +
    '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>'
  );
}

const VERSION = `${XML}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="14, 0, 0, 0 WIN32LEWindows_10"/>`;
const SETTINGS = `${XML}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`;
const CONTAINER = `${XML}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`;
const MANIFEST = `${XML}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`;

/** 블록 → .hwpx 바이트. mimetype이 첫 항목(무압축)이어야 한다 */
export function toHwpx(
  blocks: readonly Block[],
  meta: { title: string } = { title: "" },
): Uint8Array {
  return zipStore([
    { name: "mimetype", data: HWPX_MIME },
    { name: "version.xml", data: VERSION },
    { name: "META-INF/container.xml", data: CONTAINER },
    { name: "META-INF/manifest.xml", data: MANIFEST },
    { name: "settings.xml", data: SETTINGS },
    { name: "Contents/content.hpf", data: contentHpf(meta.title) },
    { name: "Contents/header.xml", data: headerXml() },
    { name: "Contents/section0.xml", data: sectionXml(blocks) },
  ]);
}
