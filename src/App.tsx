import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './App.css';

function App() {
  const [html, setHtml] = useState('<h1>欢迎使用HTML在线预览工具</h1>');
  const [selectedSize, setSelectedSize] = useState({ id: 1, name: '竖图', width: 1080, height: 1440, ratio: '3:4' });
  const [showCropArea, setShowCropArea] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportedImages, setExportedImages] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);

  // 小红书图片尺寸选项
  const sizeOptions = [
    { id: 1, name: '竖图', width: 1080, height: 1440, ratio: '3:4' },
    { id: 2, name: '长图', width: 1080, height: 1920, ratio: '9:16' },
    { id: 3, name: '方图', width: 1080, height: 1080, ratio: '1:1' },
  ];

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

  // 解析HTML识别小红书容器
  const parseXiaohongshuContainers = (html: string): HTMLElement[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // 使用类型断言确保返回HTMLElement数组
    return Array.from(doc.getElementsByClassName('xiaohongshu-container')) as HTMLElement[];
  };

  // 将单个容器转换为图片
  const convertContainerToImage = async (container: HTMLElement): Promise<HTMLCanvasElement> => {
    // 直接从ref获取iframe
    const iframe = previewRef.current;
    if (!iframe) {
      throw new Error('预览iframe不存在');
    }
    
    // 获取容器所在的文档并确保它附加到窗口
    const ownerDoc = container.ownerDocument || document;
    // 验证文档是否附加到窗口，否则使用主文档
    const safeDoc = ownerDoc.defaultView ? ownerDoc : document;
    
    // 在安全文档中创建临时div存放容器内容
    const tempDiv = safeDoc.createElement('div');
    tempDiv.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      display: inline-block;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
    `;
    const clonedContainer = container.cloneNode(true) as HTMLElement;
    // 将克隆元素采用到安全文档中
    safeDoc.adoptNode(clonedContainer);
    tempDiv.appendChild(clonedContainer);
    
    // 应用原始容器的计算样式到克隆元素及其所有子元素
    const applyComputedStyles = (element: HTMLElement) => {
      const computedStyle = getComputedStyle(element);
      Array.from(computedStyle).forEach(key => {
        element.style.setProperty(
          key,
          computedStyle.getPropertyValue(key),
          computedStyle.getPropertyPriority(key)
        );
      });
      
      // 处理伪元素样式 (::before 和 ::after)
      ['before', 'after'].forEach(pseudo => {
        const pseudoStyle = getComputedStyle(element, `::${pseudo}`);
        const content = pseudoStyle.getPropertyValue('content');
        
        if (content !== 'none' && content !== '') {
          const pseudoElement = document.createElement('div');
          // 应用伪元素样式
          Array.from(pseudoStyle).forEach(key => {
            pseudoElement.style.setProperty(
              key,
              pseudoStyle.getPropertyValue(key),
              pseudoStyle.getPropertyPriority(key)
            );
          });
          // 设置伪元素位置
          pseudoElement.style.position = 'absolute';
          pseudoElement.style.content = content;
          
          if (pseudo === 'before') {
            element.insertBefore(pseudoElement, element.firstChild);
          } else {
            element.appendChild(pseudoElement);
          }
        }
      });
      
      // 递归应用到所有子元素
      Array.from(element.children).forEach(child => {
        if (child instanceof HTMLElement) {
          applyComputedStyles(child);
        }
      });
    };
    
    applyComputedStyles(clonedContainer);
    
    safeDoc.body.appendChild(tempDiv);

    // 使用html2canvas转换容器内容
    const canvas = await html2canvas(tempDiv, {
      scale: 2,
      useCORS: true,
      logging: false,
      allowTaint: true,
      window: safeDoc.defaultView,
      document: safeDoc as Document,
      onclone: (document) => {
        // 确保iframe变量在回调中可用
        const iframe = previewRef.current;
        if (!iframe?.contentDocument) return;
        
        // 复制iframe文档的样式到克隆文档
        const styleSheets = Array.from(iframe.contentDocument.styleSheets) as CSSStyleSheet[];
        styleSheets.forEach((styleSheet: CSSStyleSheet) => {
          try {
            if (styleSheet.href) {
              // 解析相对URL为绝对URL
              const absoluteHref = new URL(styleSheet.href, iframe.contentDocument.baseURI).href;
              // 处理外部样式表
              const link = document.createElement('link');
              link.rel = 'stylesheet';
              link.href = absoluteHref;
              document.head.appendChild(link);
            } else {
              // 处理内联样式表
              const style = document.createElement('style');
              // 添加媒体查询(如果有)
              if (styleSheet.media.mediaText) {
                style.media = styleSheet.media.mediaText;
              }
              // 添加CSS规则
              const cssRules = Array.from(styleSheet.cssRules) as CSSRule[];
              cssRules.forEach((rule: CSSRule) => {
                style.sheet?.insertRule(rule.cssText);
              });
              document.head.appendChild(style);
            }
          } catch (e) {
            console.warn('无法复制样式表规则:', e);
          }
        });
      },
    });

    // 移除临时元素
    safeDoc.body.removeChild(tempDiv);
    return canvas;
  };

  // 将HTML内容转换为图片
  const convertHtmlToImage = async (): Promise<HTMLCanvasElement[]> => {
    setIsProcessing(true);
    setErrorMessage('');

    try {
      const iframe = previewRef.current;
      if (!iframe) {
        throw new Error('预览iframe不存在');
      }

      // 等待iframe加载完成
      await new Promise<void>(resolve => {
        if (iframe.contentDocument?.readyState === 'complete') {
          resolve();
        } else {
          iframe.onload = resolve;
        }
      });

      // 验证iframe内容
      if (!iframe.contentDocument?.body) {
        throw new Error('预览内容未加载完成');
      }

      // 将iframe内容导入到主文档中处理
      const mainDoc = document;
      const tempContainer = mainDoc.createElement('div');
      // 设置为可见但移出视口，避免display:none导致渲染问题
      tempContainer.style.cssText = `
        position: absolute;
        left: -9999px;
        top: 0;
        margin: 0;
        padding: 0;
        border: none;
      `;
      
      const iframeBody = iframe.contentDocument?.body;
      if (!iframeBody) {
        throw new Error('iframe body不存在');
      }
      
      // 导入iframe的body到主文档
      const importedBody = mainDoc.importNode(iframeBody, true);
      tempContainer.appendChild(importedBody);
      mainDoc.body.appendChild(tempContainer);
      
      // 验证临时容器是否已附加到文档
      if (!tempContainer.parentNode) {
        throw new Error('临时容器未成功附加到文档');
      }

      // 直接从主文档的临时容器中获取元素
      const mainContainers = tempContainer.querySelectorAll('.xiaohongshu-container') as NodeListOf<HTMLElement>;
      if (mainContainers.length === 0) {
        throw new Error('未找到xiaohongshu-container容器');
      }

      // 2. 验证并转换每个容器为图片
      const canvases: HTMLCanvasElement[] = [];
      for (const [index, container] of Array.from(mainContainers).entries()) {
        // 验证容器内容
        if (!container.firstElementChild) {
          throw new Error(`容器 ${index + 1} 内容为空`);
        }

        try {
          const canvas = await convertContainerToImage(container);
          canvases.push(canvas);
        } catch (error) {
          throw new Error(`容器 ${index + 1} 转换失败: ${(error as Error).message}`);
        }
      }

    return canvases;
    } catch (error) {
      console.error('HTML转图片失败:', error);
      setErrorMessage(error instanceof Error ? error.message : 'HTML转图片失败，请重试');
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  // 生成导出预览图
  const generateExportPreview = async (images: HTMLCanvasElement[]): Promise<void> => {
    setExportedImages(images.map(canvas => canvas.toDataURL('image/png')));
  };

  // 处理切割区域预览
  const handleCropPreview = async (): Promise<boolean> => {
    setShowCropArea(true);
    // 生成预览图
    const canvases = await convertHtmlToImage();
    if (canvases.length > 0) {
        setExportedImages(canvases.map(canvas => canvas.toDataURL('image/png')));
      }
    return true;
  };

  // 验证容器尺寸是否符合要求
  const validateContainerSize = (canvas: HTMLCanvasElement): boolean => {
    const maxWidth = 1080;
    const maxHeight = 1920;
    return canvas.width <= maxWidth * 2 && canvas.height <= maxHeight * 2;
  };

  // 切割图片为指定尺寸
  const cropImageToSizes = (canvases: HTMLCanvasElement[]): HTMLCanvasElement[] => {
    const { width: targetWidth, height: targetHeight } = selectedSize;
    const croppedCanvases: HTMLCanvasElement[] = [];

    // 处理每个容器画布
    for (const canvas of canvases) {
      // 验证尺寸
      if (!validateContainerSize(canvas)) {
        throw new Error(`容器尺寸超出限制: ${canvas.width/2}x${canvas.height/2}px`);
      }

      // 创建与目标尺寸匹配的画布
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = targetWidth;
      croppedCanvas.height = targetHeight;
      const ctx = croppedCanvas.getContext('2d');

      if (!ctx) continue;

      // 计算缩放比例以适应目标尺寸
      const scale = Math.min(
        targetWidth / canvas.width,
        targetHeight / canvas.height
      );
      const scaledWidth = canvas.width * scale;
      const scaledHeight = canvas.height * scale;

      // 在目标画布居中绘制
      ctx.drawImage(
        canvas,
        0, 0, canvas.width, canvas.height,
        (targetWidth - scaledWidth) / 2,
        (targetHeight - scaledHeight) / 2,
        scaledWidth, scaledHeight
      );

      croppedCanvases.push(croppedCanvas);
    }

    return croppedCanvases;
  };

  // 切割并导出图片
  const handleCutAndExport = async () => {
    try {
      // 1. 将HTML转为图片数组
      const canvases = await convertHtmlToImage();
      if (canvases.length === 0) {
        throw new Error('未生成任何图片，请检查HTML内容');
      }

      // 2. 按选定尺寸处理图片
      const croppedCanvases = cropImageToSizes(canvases);
      if (croppedCanvases.length === 0) {
        throw new Error('图片切割失败，无法生成有效图片');
      }

      const imageDataUrls = croppedCanvases.map(canvas => canvas.toDataURL('image/png'));
      setExportedImages(imageDataUrls);

      // 3. 直接传递数据给下载函数
      handleDownload(imageDataUrls);
    } catch (error) {
      console.error('切割导出失败:', error);
      setErrorMessage(error instanceof Error ? error.message : '切割导出失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  // 处理图片下载
  const handleDownload = async (dataUrls?: string[]) => {
    const imagesToExport = dataUrls || exportedImages;
    if (imagesToExport.length === 0) {
      setErrorMessage('没有可导出的图片');
      return;
    }

    try {
      const zip = new JSZip();
      const imgFolder = zip.folder('小红书图片');
      if (!imgFolder) {
        throw new Error('无法创建压缩文件夹');
      }

      // 将图片添加到zip
      imagesToExport.forEach((dataUrl, index) => {
        const base64Data = dataUrl.replace(/^data:image\/(png|jpeg);base64,/, '');
        imgFolder.file(`image_${index + 1}.png`, base64Data, { base64: true });
      });

      // 生成zip并下载
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `小红书图片_${new Date().getTime()}.zip`);
    } catch (err) {
      setErrorMessage(`导出失败: ${err instanceof Error ? err.message : String(err)}`);
    }
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

  // 图片预览模态框
  const renderImageModal = () => {
    if (!showImageModal) return null;
    return (
      <div className="image-modal">
        <div className="modal-overlay" onClick={() => setShowImageModal(false)} />
        <div className="modal-content">
          {selectedImage ? (
            <img src={selectedImage} alt="大图预览" className="modal-image" style={{ maxWidth: '90%', maxHeight: '80vh' }} />
          ) : (
            <div className="loading-spinner">加载中...</div>
          )}
          <button className="modal-close" onClick={() => setShowImageModal(false)}>
            关闭
          </button>
        </div>
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
                src={src} // 确保src是有效的data URL
                alt={`导出图片 ${index + 1}`}
                className="export-image-thumbnail"
                onClick={() => {
                  if (src) {
                    setSelectedImage(src);
                    setShowImageModal(true);
                  } else {
                    setErrorMessage('无效的图片数据');
                  }
                }}
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
      <div className="app-container">
        {renderError()}
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
                {renderExportPreview()}
              </div>
            </div>
          </div>
        </div>
        {showImageModal && renderImageModal()}
      </div>
    );

}

export default App;