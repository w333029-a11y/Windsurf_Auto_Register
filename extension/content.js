// Content script for Windsurf registration automation

console.log('Windsurf Auto Register - Content Script Loaded');
console.log('当前页面URL:', window.location.href);

// 检查页面类型并输出调试信息
if (window.location.href.includes('register')) {
    console.log('📝 检测到注册页面');
} else {
    console.log('❓ 未知页面类型');
}

// 暴露函数给悬浮面板使用
window.startRegistration = async function(email, password) {
    return await handleRegistration(email, password);
};

window.fillVerificationCodeFromPanel = async function(code) {
    return await fillVerificationCode(code);
};

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('收到消息:', request);
    
    if (request.action === 'startRegistration') {
        handleRegistration(request.email, request.password).then(sendResponse);
        return true; // 保持消息通道开启
    }
    
    if (request.action === 'fillVerificationCode') {
        fillVerificationCode(request.code).then(sendResponse);
        return true;
    }
    
    return false;
});

// 检查是否在登录页面
function isLoginPage() {
    const url = window.location.href;
    return url.includes('/account/login') || url.includes('/login');
}

// 检查是否在注册页面
function isRegisterPage() {
    const url = window.location.href;
    return url.includes('/account/register') || url.includes('/register') || url.includes('/signup');
}

// 等待到达注册页面
async function waitForRegisterPage(maxWaitTime = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
        if (isRegisterPage()) {
            console.log('✅ 已到达注册页面');
            return true;
        }
        await delay(500);
    }
    
    console.log('⏱️ 等待注册页面超时');
    return false;
}

// 跳转到注册页面
async function navigateToSignUp() {
    console.log('检测到登录页面，准备跳转到注册页面...');
    
    if (window.updatePanelStatus) {
        window.updatePanelStatus('🔄 正在跳转到注册页面...', 'info');
        window.addPanelLog('📍 检测到登录页面', 'info');
        window.addPanelLog('🔄 正在跳转...', 'info');
    }
    
    // 查找 "Sign up" 链接
    const signUpSelectors = [
        'a[href*="register"]',
        'a[href*="signup"]',
        'a[href*="sign-up"]'
    ];
    
    // 尝试通过文本查找
    const allLinks = document.querySelectorAll('a');
    for (const link of allLinks) {
        const text = link.textContent.toLowerCase().trim();
        if (text === 'sign up' || text === 'signup' || text === '注册') {
            console.log('找到注册链接:', link.href);
            link.click();
            
            // 等待页面跳转
            const arrived = await waitForRegisterPage(5000);
            return arrived;
        }
    }
    
    // 尝试通过选择器查找
    for (const selector of signUpSelectors) {
        try {
            const element = document.querySelector(selector);
            if (element) {
                console.log('找到注册链接:', selector);
                element.click();
                
                // 等待页面跳转
                const arrived = await waitForRegisterPage(5000);
                return arrived;
            }
        } catch (e) {
            continue;
        }
    }
    
    // 如果找不到链接，直接导航到注册页面
    const registerUrl = window.location.origin + '/account/register';
    console.log('未找到注册链接，直接导航到:', registerUrl);
    window.location.href = registerUrl;
    
    // 等待页面跳转
    const arrived = await waitForRegisterPage(5000);
    return arrived;
}

// 处理注册流程
async function handleRegistration(email, password = null) {
    try {
        console.log('开始自动注册流程');
        
        // 如果在登录页面，先跳转到注册页面
        if (isLoginPage()) {
            console.log('当前在登录页面，需要先跳转到注册页面');
            
            const navigated = await navigateToSignUp();
            
            if (!navigated) {
                console.error('❌ 跳转到注册页面失败');
                if (window.updatePanelStatus) {
                    window.updatePanelStatus('❌ 跳转失败', 'error');
                    window.addPanelLog('❌ 无法跳转到注册页面', 'error');
                    window.addPanelLog('💡 请手动访问注册页面', 'info');
                }
                return { success: false, error: '跳转失败' };
            }
            
            console.log('✅ 已跳转到注册页面');
            if (window.updatePanelStatus) {
                window.updatePanelStatus('✅ 已到达注册页面', 'success');
                window.addPanelLog('✅ 成功跳转到注册页面', 'success');
            }
            
            // 额外等待，确保页面完全加载
            await delay(2000);
        }
        
        // 确认当前在注册页面
        if (!isRegisterPage()) {
            console.error('❌ 不在注册页面，无法继续');
            if (window.updatePanelStatus) {
                window.updatePanelStatus('❌ 页面错误', 'error');
                window.addPanelLog('❌ 请在注册页面使用此功能', 'error');
            }
            return { success: false, error: '不在注册页面' };
        }
        
        console.log('✅ 确认在注册页面，开始填写表单');
        if (window.updatePanelStatus) {
            window.updatePanelStatus('🚀 开始自动填写...', 'info');
            window.addPanelLog('📝 开始填写注册表单', 'info');
        }
        
        // 等待页面加载完成
        await delay(1000);
        
        // 等待页面加载完成
        await waitForElement('input[type="email"], input[name="email"]', 5000);
        
        // 查找邮箱输入框
        const emailInput = findEmailInput();
        if (!emailInput) {
            throw new Error('未找到邮箱输入框');
        }
        
        // 填写邮箱
        await fillInput(emailInput, email);
        console.log('邮箱已填写');
        
        // 检查是否在第一步（只有 First name, Last name, Email）
        const firstNameInput = document.querySelector('input[name="firstName"], input[placeholder*="first name" i]');
        const lastNameInput = document.querySelector('input[name="lastName"], input[placeholder*="last name" i]');
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        
        // 如果有 First name 和 Last name，但没有密码框，说明在第一步
        if (firstNameInput && lastNameInput && passwordInputs.length === 0) {
            console.log('检测到第一步：填写基本信息');
            
            // 填写 First name
            if (!firstNameInput.value) {
                const firstName = generateFirstName();
                await fillInput(firstNameInput, firstName);
                console.log('First name 已填写:', firstName);
            }
            
            // 填写 Last name
            if (!lastNameInput.value) {
                const lastName = generateLastName();
                await fillInput(lastNameInput, lastName);
                console.log('Last name 已填写:', lastName);
            }
            
            // 勾选同意条款
            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            for (const checkbox of checkboxes) {
                if (isVisible(checkbox) && !checkbox.checked) {
                    checkbox.click();
                    await delay(100);
                    console.log('已勾选复选框');
                }
            }
            
            // 查找并点击第一步的 Continue 按钮
            await delay(500);
            const continueBtn = findSubmitButton();
            if (continueBtn) {
                continueBtn.click();
                console.log('已点击 Continue，进入第二步');
                
                // 等待第二步加载
                await delay(2000);
                
                // 填写密码
                const newPasswordInputs = document.querySelectorAll('input[type="password"]');
                if (newPasswordInputs.length > 0) {
                    console.log('检测到第二步：设置密码');
                    for (const input of newPasswordInputs) {
                        if (isVisible(input)) {
                            await fillInput(input, password);
                            console.log('密码已填写');
                        }
                    }
                    
                    // 等待一下，然后点击第二步的 Continue
                    await delay(1000);
                    const secondContinueBtn = findSubmitButton();
                    if (secondContinueBtn) {
                        secondContinueBtn.click();
                        console.log('已点击第二步的 Continue，等待人机验证');
                        
                        // 等待人机验证页面加载
                        await delay(2000);
                    }
                }
            }
            
            // 开始监听人机验证完成
            console.log('开始监听人机验证完成');
            waitForCaptchaCompletion();
            
            return { 
                success: true, 
                message: '请完成人机验证，验证后会自动继续',
                needsCaptcha: true,
                waitingForCaptcha: true,
                step: 'captcha'
            };
        } else {
            // 如果已经在第二步（有密码框），直接填写密码
            console.log('检测到第二步：设置密码');
            await fillOtherFields(password);
            
            return { 
                success: true, 
                message: '请完成人机验证并点击 Continue',
                needsCaptcha: true,
                waitingForCaptcha: true
            };
        }
    } catch (error) {
        console.error('注册失败:', error);
        return { success: false, error: error.message };
    }
}

// 填写验证码
async function fillVerificationCode(code) {
    try {
        console.log('填写验证码:', code);
        
        // 确保验证码是字符串
        const codeStr = String(code).trim();
        console.log('验证码字符串:', codeStr, '长度:', codeStr.length);
        
        // 等待验证码输入框出现
        await delay(1000);
        
        // 查找所有可能的验证码输入框
        const codeInputs = document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');
        const visibleInputs = Array.from(codeInputs).filter(input => {
            const rect = input.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && 
                   window.getComputedStyle(input).visibility !== 'hidden' &&
                   window.getComputedStyle(input).display !== 'none';
        });
        
        console.log('找到', visibleInputs.length, '个可见输入框');
        
        // 如果有多个输入框（分离式验证码）
        if (visibleInputs.length >= codeStr.length) {
            console.log('检测到分离式验证码输入框');
            
            // 取前 N 个输入框（N = 验证码长度）
            const targetInputs = visibleInputs.slice(0, codeStr.length);
            
            for (let i = 0; i < codeStr.length; i++) {
                const input = targetInputs[i];
                const char = codeStr[i];
                
                console.log(`填写第 ${i+1} 个输入框: ${char}`);
                
                // 聚焦输入框
                input.focus();
                await delay(50);
                
                // 清空输入框
                input.value = '';
                
                // 设置值
                input.value = char;
                
                // 触发所有可能的事件
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
                
                await delay(100);
            }
            
            console.log('✅ 所有验证码字符已填写');
            
            // 失焦最后一个输入框，触发验证
            targetInputs[targetInputs.length - 1].blur();
            await delay(500);
            
        } else {
            // 单个输入框的情况
            console.log('检测到单个验证码输入框');
            const codeInput = findCodeInput();
            if (!codeInput) {
                throw new Error('未找到验证码输入框');
            }
            
            await fillInput(codeInput, codeStr);
            console.log('验证码已填写到单个输入框');
        }
        
        // 查找并点击确认按钮（如果有）
        await delay(1000);
        const confirmButton = findConfirmButton();
        if (confirmButton && !confirmButton.disabled) {
            console.log('找到确认按钮，准备点击');
            confirmButton.click();
            console.log('已点击确认按钮');
        } else {
            console.log('未找到可用的确认按钮，验证码可能会自动提交');
        }
        
        return { success: true, message: '验证码已提交' };
    } catch (error) {
        console.error('填写验证码失败:', error);
        return { success: false, error: error.message };
    }
}

// 查找邮箱输入框
function findEmailInput() {
    const selectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="邮箱" i]',
        'input[id*="email" i]'
    ];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && isVisible(element)) {
            return element;
        }
    }
    
    return null;
}

// 查找验证码输入框
function findCodeInput() {
    const selectors = [
        'input[name*="code" i]',
        'input[name*="verification" i]',
        'input[placeholder*="code" i]',
        'input[placeholder*="验证码" i]',
        'input[id*="code" i]',
        'input[id*="verification" i]'
    ];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && isVisible(element)) {
            return element;
        }
    }
    
    return null;
}

// 查找提交按钮
function findSubmitButton() {
    // 先尝试通过文本内容查找（最准确）
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
        const text = button.textContent.toLowerCase().trim();
        if ((text === 'continue' || text === 'sign up' || text === 'register' || 
             text === '注册' || text === '继续') && 
            isVisible(button) && !button.disabled) {
            console.log('找到提交按钮:', text);
            return button;
        }
    }
    
    // 尝试精确选择器
    const selectors = [
        'button[type="submit"]',
        'input[type="submit"]'
    ];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && isVisible(element) && !element.disabled) {
            console.log('找到提交按钮:', selector);
            return element;
        }
    }
    
    console.log('未找到提交按钮');
    return null;
}

// 查找确认按钮
function findConfirmButton() {
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
        const text = button.textContent.toLowerCase();
        if ((text.includes('confirm') || text.includes('verify') || 
             text.includes('确认') || text.includes('验证') ||
             text.includes('submit') || text.includes('continue')) && 
            isVisible(button)) {
            return button;
        }
    }
    
    return document.querySelector('button[type="submit"]');
}

// 填写其他必填字段
async function fillOtherFields(providedPassword = null) {
    // 查找 First name 输入框
    const firstNameInput = document.querySelector('input[name="firstName"], input[placeholder*="first name" i]');
    if (firstNameInput && isVisible(firstNameInput) && !firstNameInput.value) {
        const firstName = generateFirstName();
        await fillInput(firstNameInput, firstName);
        console.log('First name 已填写:', firstName);
    }
    
    // 查找 Last name 输入框
    const lastNameInput = document.querySelector('input[name="lastName"], input[placeholder*="last name" i]');
    if (lastNameInput && isVisible(lastNameInput) && !lastNameInput.value) {
        const lastName = generateLastName();
        await fillInput(lastNameInput, lastName);
        console.log('Last name 已填写:', lastName);
    }
    
    // 查找密码输入框
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    if (passwordInputs.length > 0) {
        const password = providedPassword || generatePassword();
        console.log('使用密码:', providedPassword ? '扩展提供' : '自动生成');
        for (const input of passwordInputs) {
            if (isVisible(input)) {
                await fillInput(input, password);
                console.log('密码输入框已填写');
            }
        }
    }
    
    // 查找用户名输入框
    const usernameInput = document.querySelector('input[name="username"], input[name="name"]');
    if (usernameInput && isVisible(usernameInput) && !usernameInput.value) {
        const username = generateUsername();
        await fillInput(usernameInput, username);
        console.log('用户名已填写');
    }
    
    // 查找并勾选同意条款复选框
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
        if (isVisible(checkbox) && !checkbox.checked) {
            checkbox.click();
            await delay(100);
            console.log('已勾选复选框');
        }
    }
}

// 填写输入框
async function fillInput(element, value) {
    element.focus();
    await delay(100);
    
    // 清空现有内容
    element.value = '';
    
    // 触发输入事件
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    // 设置值
    element.value = value;
    
    // 再次触发事件
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    
    await delay(100);
}

// 生成随机密码
function generatePassword() {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
}

// 生成随机用户名
function generateUsername() {
    const adjectives = ['Quick', 'Smart', 'Cool', 'Fast', 'Bright'];
    const nouns = ['Fox', 'Eagle', 'Tiger', 'Wolf', 'Bear'];
    const number = Math.floor(Math.random() * 1000);
    return adjectives[Math.floor(Math.random() * adjectives.length)] + 
           nouns[Math.floor(Math.random() * nouns.length)] + 
           number;
}

// 生成随机 First Name
function generateFirstName() {
    const names = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn'];
    return names[Math.floor(Math.random() * names.length)];
}

// 生成随机 Last Name
function generateLastName() {
    const names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
    return names[Math.floor(Math.random() * names.length)];
}

// 检查元素是否可见
function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetWidth > 0 &&
           element.offsetHeight > 0;
}

// 等待元素出现
function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }
        
        const observer = new MutationObserver((mutations) => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`等待元素超时: ${selector}`));
        }, timeout);
    });
}

// 延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
