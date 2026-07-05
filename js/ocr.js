async function recognizeReceiptImage(file, onProgress) {
  if (typeof Tesseract === 'undefined') {
    throw new Error('OCR_UNAVAILABLE');
  }
  const { data } = await Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });
  return data.text;
}
