/** Live watermark preview for the PDF editor (no library needed). */
document.addEventListener('DOMContentLoaded', function () {
  var textInput    = document.getElementById('watermarkText');
  var colorInput   = document.getElementById('watermarkColor');
  var opacityInput = document.getElementById('watermarkOpacity');
  var previewText  = document.getElementById('wmPreviewText');
  var opacityLabel = document.getElementById('watermarkOpacityLabel');

  function updatePreview() {
    if (!previewText) return;
    if (textInput)    previewText.textContent    = textInput.value || 'WATERMARK';
    if (colorInput)   previewText.style.color    = colorInput.value;
    if (opacityInput) {
      previewText.style.opacity = opacityInput.value;
      if (opacityLabel) opacityLabel.textContent = Math.round(opacityInput.value * 100) + '%';
    }
  }

  if (textInput)    textInput.addEventListener('input',  updatePreview);
  if (colorInput)   colorInput.addEventListener('input', updatePreview);
  if (opacityInput) opacityInput.addEventListener('input', updatePreview);
});
