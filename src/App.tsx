import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

function App() {
  const [html, setHtml] = useState('<h1>欢迎使用HTML在线预览工具</h1>');
  const [selectedSize, setSelectedSize] = useState({ id: 1, name: '竖图', width: 1080, height: 1440, ratio: '3:4' });
  const [showCropArea, setShowCropArea] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);

  // 小红书图片尺寸选项
  const sizeOptions = [
    { id: 1, name: '竖图', width: 1080, height: 1440, ratio: '3:4' },
    { id: 2, name: '长图', width: 1080, height: 1920, ratio: '9:16' },
    { id: 3, name: '方图', width: 1080, height: 1080, ratio: '1:1' },
  ];

  // 预览切割区域
  const handleCropPreview = () => {
    setShowCropArea(!showCropArea);
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const [exportedImages, setExportedImages] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  // 处理iframe加载完成
  useEffect(() => {
    const iframe = previewRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      console.log('预览内容加载完成');
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [html]);

  // 将HTML内容转换为图片
  const convertHtmlToImage = async (): Promise<HTMLCanvasElement> => {
    setIsProcessing(true);
    setErrorMessage('');

    try {
      const iframe = previewRef.current;
      if (!iframe?.contentDocument?.body) {
        throw new Error('预览内容未加载完成');
      }

      // 使用html2canvas将iframe内容转为canvas
      const canvas = await html2canvas(iframe.contentDocument.body, {
        scale: 2, // 提高分辨率
        useCORS: true,
        logging: false,
        allowTaint: false,
        scrollY: -window.scrollY,
        windowWidth: iframe.contentDocument.documentElement.scrollWidth,
        windowHeight: iframe.contentDocument.documentElement.scrollHeight
      });

      return canvas;
    } catch (error) {
      console.error('HTML转图片失败:', error);
      setErrorMessage(error instanceof Error ? error.message : 'HTML转图片失败，请重试');
      throw error;
    }
  };

  // 切割图片为指定尺寸
  const cropImageToSizes = (canvas: HTMLCanvasElement): HTMLCanvasElement[] => {
    const { width: targetWidth, height: targetHeight } = selectedSize;
    const sourceWidth = canvas.width;
    const sourceHeight = canvas.height;

    // 计算需要切割的数量
    const cols = Math.ceil(sourceWidth / targetWidth);
    const rows = Math.ceil(sourceHeight / targetHeight);

    const croppedCanvases: HTMLCanvasElement[] = [];

    // 创建切割后的canvas
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = targetWidth;
        croppedCanvas.height = targetHeight;
        const ctx = croppedCanvas.getContext('2d');

        if (!ctx) continue;

        // 计算切割位置
        const x = col * targetWidth;
        const y = row * targetHeight;

        // 绘制切割区域
        ctx.drawImage(
          canvas,
          x, y,
          Math.min(targetWidth, sourceWidth - x),
          Math.min(targetHeight, sourceHeight - y),
          0, 0,
          targetWidth, targetHeight
        );

        croppedCanvases.push(croppedCanvas);
      }
    }

    return croppedCanvases;
  };

  // 切割并导出图片
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCutAndExport = async () => {
    try {
      // 1. 将HTML转为图片
      const canvas = await convertHtmlToImage();

      // 2. 按选定尺寸切割图片
      const croppedCanvases = cropImageToSizes(canvas);
      setExportedImages(croppedCanvases.map(canvas => canvas.toDataURL('image/png')));

      // 3. 自动下载
      await handleDownload();
    } catch (error) {
      console.error('切割导出失败:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // 处理图片下载
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDownload = async () => {
    if (exportedImages.length === 0) return;

    const zip = new JSZip();
    const imgFolder = zip.folder('小红书图片');

    // 将图片添加到zip
    exportedImages.forEach((dataUrl, index) => {
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      imgFolder?.file(`image_${index + 1}.png`, base64Data, { base64: true });
    });

    // 生成zip并下载
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `小红书图片_${new Date().getTime()}.zip`);
  };

  // 清除导出结果
  const clearExportedImages = () => {
    setExportedImages([]);
  };

  // 显示错误信息
  const renderError = () => {
    if (!errorMessage) return null;
    return (
      <div className="error-message">
        ⚠️ {errorMessage}
      </div>
    );
  };

  // 显示导出结果预览
  const renderExportPreview = () => {
    if (exportedImages.length === 0) return null;

    return (
      <div className="export-preview">
        <h4>导出结果 ({exportedImages.length}张图片)</h4>
        <div className="export-images">
          {exportedImages.map((src, index) => (
            <div key={index} className="export-image-item">
              <img
                src={src}
                alt={`导出图片 ${index + 1}`}
                className="export-image-thumbnail"
              />
              <div className="export-image-index">{index + 1}</div>
            </div>
          ))}
        </div>
        <div className="export-actions">
          <button
            className="btn-primary btn-download"
            onClick={handleDownload}
          >
            重新下载
          </button>
          <button
            className="btn-secondary btn-clear"
            onClick={clearExportedImages}
          >
            清除结果
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="app-root">
      {/* 顶部导航栏 */}
      <header className="app-header">
        <div className="app-title">HTML在线预览与小红书图片切割工具</div>
        <a className="app-github" href="https://github.com/" target="_blank" rel="noopener noreferrer">GitHub</a>
      </header>
      {/* 主体区域 */}
      <div className="app-main">
        {/* 左侧：HTML输入区 */}
        <div className="app-editor">
          <textarea
            value={html}
            onChange={e => setHtml(e.target.value)}
            className="editor-textarea"
            placeholder="请输入或粘贴HTML代码..."
          />
        </div>
        {/* 中间：实时预览区 */}
        <div className="app-preview">
          <div className="preview-container">
            <iframe
              title="HTML预览"
              sandbox="allow-same-origin"
              srcDoc={html}
              className="preview-iframe"
              ref={previewRef}
            />
            {showCropArea && (
              <div className="crop-overlay"
                style={{ width: `${selectedSize.width}px`, height: `${selectedSize.height}px` }}
              />
            )}
          </div>
        </div>
        {/* 右侧：设置与导出区 */}
        <div className="app-settings">
          <div className="settings-section">
            <h3>小红书尺寸选择</h3>
            <div className="size-options">
              {sizeOptions.map(size => (
                <div
                  key={`${size.width}x${size.height}`}
                  className={`size-option ${selectedSize.id === size.id ? 'active' : ''}`}
                  onClick={() => setSelectedSize(size)}
                >
                  <div className="size-label">{size.name}</div>
                  <div className="size-dimensions">{size.width} × {size.height}px</div>
                  <div className="size-ratio">比例 {size.ratio}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="settings-section">
            <button
              className="btn-primary btn-cut"
              onClick={handleCropPreview}
              disabled={isProcessing}
            >
              预览切割区域
            </button>
            <button
              className="btn-primary btn-export"
              onClick={handleCutAndExport}
              disabled={isProcessing || !html.trim()}
            >
              {isProcessing ? '处理中...' : '切割并导出'}
            </button>
            {renderError()}
            {renderExportPreview()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;