import { itemMeta, matchedText, removeText, sizeText, storageText, trashContentsText, viewerFor } from './vault-text';

describe('vault wording', () => {
  it('writes sizes as people read them', () => {
    expect(sizeText(1)).toBe('1 byte');
    expect(sizeText(12)).toBe('12 bytes');
    expect(sizeText(1024)).toBe('1 KB');
    expect(sizeText(820 * 1024)).toBe('820 KB');
    expect(sizeText(2.4 * 1024 ** 2)).toBe('2.4 MB');
    expect(sizeText(10 * 1024 ** 3)).toBe('10 GB');
    expect(storageText(1.2 * 1024 ** 3, 10 * 1024 ** 3)).toBe('1.2 GB of 10 GB used');
  });

  it('opens PDFs, images, markdown and text in the app, and downloads the rest', () => {
    expect(viewerFor('application/pdf', 'Lecture 3.pdf')).toBe('pdf');
    expect(viewerFor('application/octet-stream', 'scan.PDF')).toBe('pdf');
    expect(viewerFor('image/png', 'board.png')).toBe('image');
    expect(viewerFor('', 'answer.md')).toBe('markdown');
    expect(viewerFor('text/plain', 'notes.txt')).toBe('text');
    expect(viewerFor('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Week 4.pptx')).toBeNull();
    expect(viewerFor('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Essay.docx')).toBeNull();
    expect(viewerFor('application/zip', 'code.zip')).toBeNull();
  });

  it('describes an item under its name', () => {
    expect(itemMeta({ kind: 'note', file: null, url: null, name: 'N' })).toBe('Note');
    expect(itemMeta({ kind: 'link', file: null, url: 'https://www.claude.ai/chat/1', name: 'L' })).toBe('claude.ai');
    expect(itemMeta({ kind: 'file', file: { size: 2048, mimeType: 'application/pdf', uploaded: true }, url: null, name: 'a.pdf' })).toBe(
      'PDF · 2 KB',
    );
  });

  it('says why a search result was found, and what the trash holds', () => {
    expect(matchedText('note')).toBe('In the note');
    expect(trashContentsText(2, 5)).toBe('2 folders and 5 items inside');
    expect(trashContentsText(0, 1)).toBe('1 item inside');
    expect(trashContentsText(0, 0)).toBe('');
    expect(removeText('2026-12-16T09:00:00.000Z', 'Asia/Dhaka')).toBe('Removed for good on 16 December');
  });
});
