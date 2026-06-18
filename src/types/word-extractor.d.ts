// Минимальная декларация для word-extractor (пакет без собственных типов): извлечение текста из .doc/.docx.
declare module "word-extractor" {
  interface WordDocument {
    getBody(): string;
  }
  export default class WordExtractor {
    extract(source: string | Buffer): Promise<WordDocument>;
  }
}
