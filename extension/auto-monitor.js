// 自动监控和处理验证流程

// 监听人机验证完成
async function waitForCaptchaCompletion() {
    console.log('开始监听人机验证状态');
    
    // 检查验证是否完成的函数
    const checkCaptchaCompleted = () => {
        // 方法1: 查找勾选标记（成功图标）
        const successIcon = document.querySelector('svg[data-icon="check"], svg.success-icon, .success svg, [aria-label*="success" i]');
        if (successIcon) {
            console.log('✅ 找到成功图标');
            return true;
        }
        
        // 方法2: 检查 Continue 按钮是否可用
        const continueBtn = findSubmitButton();
        if (continueBtn && !continueBtn.disabled && !continueBtn.classList.contains('disabled')) {
            // 按钮可用，说明验证完成
            console.log('✅ Continue 按钮已启用');
            return true;
        }
        
        // 方法3: 查找验证框并检查状态
        const captchaContainer = document.querySelector('[class*="captcha" i], [class*="verification" i], [id*="captcha" i]');
        if (captchaContainer) {
            // 检查是否有成功状态的 class
            if (captchaContainer.classList.contains('success') || 
                captchaContainer.classList.contains('completed') ||
                captchaContainer.querySelector('.success, .completed')) {
                console.log('✅ 验证容器显示成功状态');
                return true;
            }
        }
        
        return false;
    };
    
    // 轮询检查验证状态
    const pollInterval = setInterval(async () => {
        console.log('检查人机验证状态...');
        
        if (checkCaptchaCompleted()) {
            console.log('✅ 人机验证已完成！');
            clearInterval(pollInterval);
            
            // 等待一下确保状态稳定
            await delay(1500);
            
            // 查找并点击 Continue 按钮
            const continueBtn = findSubmitButton();
            if (continueBtn) {
                // 再次确认按钮可点击
                if (continueBtn.disabled || continueBtn.classList.contains('disabled')) {
                    console.log('⚠️ Continue 按钮不可用，等待2秒后重试');
                    await delay(2000);
                }
                
                // 检查按钮是否可见和可点击
                const isVisible = continueBtn.offsetParent !== null;
                const isEnabled = !continueBtn.disabled && !continueBtn.classList.contains('disabled');
                
                if (isVisible && isEnabled) {
                    console.log('找到可用的 Continue 按钮，准备点击');
                    continueBtn.click();
                    console.log('✅ 已自动点击 Continue');
                    
                    // 通知悬浮面板
                    if (window.updatePanelStatus) {
                        window.updatePanelStatus('✅ 验证完成，已自动点击 Continue', 'success');
                        window.addPanelLog('✅ 人机验证已完成', 'success');
                        window.addPanelLog('✅ 已自动点击 Continue', 'success');
                        window.addPanelLog('⏳ 等待进入验证码页面...', 'info');
                    }
                    
                    // 等待验证码页面加载
                    await delay(3000);
                    
                    // 开始自动获取验证码
                    startAutoVerificationCodeCheck();
                } else {
                    console.log('⚠️ Continue 按钮不可用');
                    if (window.updatePanelStatus) {
                        window.updatePanelStatus('⚠️ 请手动点击 Continue', 'warning');
                        window.addPanelLog('⚠️ 按钮不可用，请手动点击', 'warning');
                    }
                }
            } else {
                console.log('⚠️ 未找到 Continue 按钮');
                if (window.updatePanelStatus) {
                    window.updatePanelStatus('⚠️ 未找到 Continue 按钮', 'warning');
                }
            }
        }
    }, 2000); // 每2秒检查一次
    
    // 180秒（3分钟）后停止检查
    setTimeout(() => {
        clearInterval(pollInterval);
        console.log('⏱️ 人机验证监听超时（3分钟）');
        if (window.updatePanelStatus) {
            window.updatePanelStatus('⚠️ 人机验证超时，请刷新页面重试', 'error');
            window.addPanelLog('⏱️ 等待超过3分钟，请刷新页面', 'error');
        }
    }, 180000); // 3分钟
}

// 自动获取并填写验证码
async function startAutoVerificationCodeCheck() {
    console.log('开始自动获取验证码');
    
    if (window.updatePanelStatus) {
        window.updatePanelStatus('⏳ 正在自动获取验证码...', 'info');
        window.addPanelLog('🔍 开始自动查找验证码', 'info');
    }
    
    // 获取当前邮箱
    const email = await getCurrentEmail();
    if (!email) {
        console.log('❌ 未找到邮箱信息');
        if (window.updatePanelStatus) {
            window.updatePanelStatus('❌ 未找到邮箱信息', 'error');
        }
        return;
    }
    
    console.log('当前邮箱:', email);
    
    // 轮询获取验证码
    let attempts = 0;
    const maxAttempts = 20; // 最多尝试20次（约60秒）
    let isSuccess = false; // 标记是否已成功
    
    const pollVerificationCode = setInterval(async () => {
        // 如果已经成功，停止轮询
        if (isSuccess) {
            clearInterval(pollVerificationCode);
            return;
        }
        
        attempts++;
        console.log(`尝试获取验证码 (${attempts}/${maxAttempts})...`);
        
        if (window.addPanelLog) {
            window.addPanelLog(`🔍 第 ${attempts} 次查找验证码...`, 'info');
        }
        
        try {
            const backendUrl = await getBackendUrl();
            const response = await fetch(`${backendUrl}/api/get-messages/${email}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': '114239wmj'
                }
            });
            const data = await response.json();
            
            if (data.success && data.messages && data.messages.length > 0) {
                console.log('✅ 找到邮件！');
                
                // 如果已经成功，不再继续
                if (isSuccess) {
                    clearInterval(pollVerificationCode);
                    return;
                }
                
                clearInterval(pollVerificationCode);
                
                const latestMessage = data.messages[0];
                if (window.addPanelLog) {
                    window.addPanelLog(`📧 找到邮件: ${latestMessage.subject}`, 'success');
                }
                
                // 获取邮件详情
                try {
                    const detailResponse = await fetch(`${backendUrl}/api/get-message/${email}/${latestMessage.id}`, {
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': '114239wmj'
                        }
                    });
                    const detailData = await detailResponse.json();
                    
                    if (detailData.success && detailData.message) {
                        // 获取邮件正文（多种格式）
                        const body = detailData.message.body || detailData.message.html || detailData.message.text || '';
                        const subject = detailData.message.subject || '';
                        
                        console.log('邮件主题:', subject);
                        console.log('邮件正文长度:', body.length);
                        
                        // 先尝试从主题提取
                        let code = null;
                        try {
                            if (subject && typeof subject === 'string') {
                                code = extractVerificationCode(subject);
                            }
                        } catch (e) {
                            console.log('主题提取验证码失败:', e);
                        }
                        
                        // 如果主题中没有，再从正文提取
                        if (!code) {
                            try {
                                if (body && typeof body === 'string') {
                                    code = extractVerificationCode(body);
                                }
                            } catch (e) {
                                console.log('正文提取验证码失败:', e);
                            }
                        }
                        
                        if (code) {
                            console.log('✅ 提取到验证码:', code);
                            if (window.addPanelLog) {
                                window.addPanelLog(`✅ 验证码: ${code}`, 'success');
                                window.addPanelLog('⏳ 正在自动填写验证码...', 'info');
                            }
                            
                            // 自动填写验证码
                            try {
                                const fillResult = await fillVerificationCode(code);
                                if (fillResult && fillResult.success) {
                                    console.log('✅ 验证码填写成功！注册完成！');
                                    
                                    // 标记为成功，停止轮询
                                    isSuccess = true;
                                    clearInterval(pollVerificationCode);
                                    
                                    // 立即显示成功，停止所有后续操作
                                    if (window.updatePanelStatus) {
                                        window.updatePanelStatus('✅ 注册成功！', 'success');
                                        window.addPanelLog('✅ 验证码已自动填写', 'success');
                                        window.addPanelLog('🎉 注册流程完成！', 'success');
                                        window.addPanelLog('🔓 正在打开Token页面...', 'info');
                                    }
                                    
                                    // 注册完成后打开Token页面
                                    setTimeout(() => {
                                        console.log('🔓 注册完成，自动打开Token页面...');
                                        chrome.runtime.sendMessage({
                                            action: 'openTokenPage'
                                        });
                                    }, 1000);
                                    
                                    // 等待Token被提取并保存后再保存账号
                                    setTimeout(async () => {
                                        try {
                                            await saveAccountToBackend(email);
                                            console.log('账号保存成功');
                                        } catch (saveError) {
                                            console.log('账号保存失败（不影响注册）:', saveError);
                                            // 静默处理，不显示错误
                                        }
                                    }, 5000);
                                    
                                    // 成功后直接返回，不再执行后续代码
                                    return;
                                } else {
                                    console.log('⚠️ 验证码填写失败');
                                    if (window.updatePanelStatus) {
                                        window.updatePanelStatus('⚠️ 验证码填写失败', 'warning');
                                        window.addPanelLog(`⚠️ 请手动输入验证码: ${code}`, 'warning');
                                    }
                                }
                            } catch (fillError) {
                                console.error('填写验证码异常:', fillError);
                                if (window.updatePanelStatus) {
                                    window.updatePanelStatus('⚠️ 验证码填写异常', 'warning');
                                    window.addPanelLog(`⚠️ 请手动输入: ${code}`, 'warning');
                                }
                            }
                        } else {
                            console.log('⚠️ 未能提取验证码');
                            if (window.addPanelLog) {
                                window.addPanelLog('⚠️ 邮件中未找到验证码', 'warning');
                            }
                        }
                    } else {
                        console.log('⚠️ 邮件详情获取失败');
                    }
                } catch (detailError) {
                    console.error('获取邮件详情异常:', detailError);
                    // 不显示错误，因为可能注册已经成功
                }
            } else if (attempts >= maxAttempts) {
                console.log('⏱️ 获取验证码超时');
                clearInterval(pollVerificationCode);
                if (window.updatePanelStatus) {
                    window.updatePanelStatus('⏱️ 等待验证码...', 'warning');
                    window.addPanelLog('💡 可能已经成功，请检查页面状态', 'info');
                    window.addPanelLog('或点击"检查验证码"手动尝试', 'info');
                }
            }
        } catch (error) {
            console.error('获取验证码出错:', error);
            
            // 如果已经成功，忽略错误
            if (isSuccess) {
                return;
            }
            
            if (attempts >= maxAttempts) {
                clearInterval(pollVerificationCode);
                if (window.updatePanelStatus) {
                    window.updatePanelStatus('⏱️ 等待验证码...', 'warning');
                    window.addPanelLog('💡 可能已经成功，请检查页面状态', 'info');
                }
            }
        }
    }, 6000); // 每6秒检查一次
}

// 获取当前邮箱
async function getCurrentEmail() {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get(['currentEmail'], (result) => {
                if (chrome.runtime.lastError) {
                    console.error('获取邮箱失败:', chrome.runtime.lastError);
                    resolve(null);
                } else {
                    resolve(result.currentEmail || null);
                }
            });
        } catch (error) {
            console.error('获取邮箱异常:', error);
            resolve(null);
        }
    });
}

// 获取后端URL
async function getBackendUrl() {
    const defaultUrl = 'https://windsurf-auto-register-backend.onrender.com';
    return new Promise((resolve) => {
        try {
            chrome.storage.sync.get(['backendUrl'], (result) => {
                if (chrome.runtime.lastError) {
                    console.error('获取后端URL失败:', chrome.runtime.lastError);
                    resolve(defaultUrl);
                } else {
                    const url = result.backendUrl || defaultUrl;
                    console.log('auto-monitor使用后端URL:', url);
                    resolve(url);
                }
            });
        } catch (error) {
            console.error('获取后端URL异常:', error);
            resolve(defaultUrl);
        }
    });
}

// 提取验证码
function extractVerificationCode(text) {
    try {
        if (!text || typeof text !== 'string') {
            console.log('⚠️ 文本无效:', typeof text);
            return null;
        }
        
        // 清理文本，移除HTML标签
        const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
        console.log('开始提取验证码，文本长度:', cleanText.length);
        
        // 专注于纯数字验证码（4-6位）
        const patterns = [
            /code[:\s]+(\d{4,6})/i,                    // code: 123456
            /验证码[：:\s]*(\d{4,6})/,                  // 验证码：123456
            /verification code[:\s]+(\d{4,6})/i,       // verification code: 123456
            /(\d{6})/,                                  // 直接匹配6位数字
            /(\d{5})/,                                  // 直接匹配5位数字
            /(\d{4})/                                   // 直接匹配4位数字
        ];
        
        for (let i = 0; i < patterns.length; i++) {
            try {
                const pattern = patterns[i];
                const match = cleanText.match(pattern);
                if (match && match[1]) {
                    console.log(`✅ 使用模式 ${i + 1} 提取到验证码:`, match[1]);
                    return match[1];
                }
            } catch (error) {
                console.log(`模式 ${i + 1} 匹配失败:`, error.message);
                continue;
            }
        }
        
        console.log('⚠️ 未能提取验证码');
        return null;
    } catch (error) {
        console.error('提取验证码异常:', error);
        return null;
    }
}

// 保存账号到后端
async function saveAccountToBackend(email) {
    try {
        console.log('保存账号信息到后端...');
        
        // 获取密码
        const password = await new Promise((resolve) => {
            chrome.storage.local.get(['currentPassword'], (result) => {
                resolve(result.currentPassword || null);
            });
        });
        
        if (!password) {
            console.log('⚠️ 未找到密码，无法保存');
            return;
        }
        
        const backendUrl = await getBackendUrl();
        const response = await fetch(`${backendUrl}/api/save-account`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': '114239wmj'
            },
            body: JSON.stringify({
                email,
                password,
                service: 'Windsurf'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ 账号已保存到后端');
        } else {
            console.log('⚠️ 保存账号失败:', data.error);
        }
    } catch (error) {
        console.error('保存账号异常:', error);
    }
}

// 延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('Auto Monitor Script Loaded');
