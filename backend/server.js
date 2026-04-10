const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'wsr-2024-default-key';

app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
}));

app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'X-API-Key'],
    credentials: true
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: '请求过于频繁，请稍后再试' },
    validate: { xForwardedForHeader: false }
});
app.use(limiter);

app.use(express.json());

const validateApiKey = (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    if (!providedKey || providedKey !== API_KEY) {
        return res.status(401).json({
            success: false,
            error: '无效的API密钥'
        });
    }
    next();
};

const FETCH_OPTIONS = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    },
    timeout: 15000
};

const MAIL_TM_API = 'https://api.mail.tm';

let cachedDomains = null;
let domainCacheTime = 0;

async function getMailDomains() {
    const now = Date.now();
    if (cachedDomains && (now - domainCacheTime) < 3600000) {
        return cachedDomains;
    }
    
    try {
        console.log('[获取域名] 开始请求 Mail.tm domains API...');
        const response = await fetch(`${MAIL_TM_API}/domains`, FETCH_OPTIONS);
        const data = await response.json();
        
        console.log('[获取域名] API 响应:', JSON.stringify(data));
        
        if (data['hydra:member'] && data['hydra:member'].length > 0) {
            const domains = data['hydra:member']
                .filter(d => d.isActive && !d.isPrivate)
                .map(d => d.domain);
            
            if (domains.length > 0) {
                cachedDomains = domains;
                domainCacheTime = now;
                console.log('[获取域名] 可用域名:', domains);
                return cachedDomains;
            }
        }
        
        console.log('[获取域名] 使用备用域名');
        return ['deltajohnsons.com', 'mailtoplus.com'];
    } catch (error) {
        console.error('[获取域名] 错误:', error.message);
        return ['deltajohnsons.com', 'mailtoplus.com'];
    }
}

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '服务运行正常',
        timestamp: new Date().toISOString(),
        apiKey: API_KEY.substring(0, 10) + '...'
    });
});

app.post('/api/generate-email', validateApiKey, async (req, res) => {
    try {
        console.log('[生成邮箱] 开始请求 Mail.tm API...');
        
        const domains = await getMailDomains();
        const domain = domains[0];
        
        const username = 'user' + Math.random().toString(36).substring(2, 10);
        const email = `${username}@${domain}`;
        const password = 'Pass' + Math.random().toString(36).substring(2, 10) + '!@#';
        
        const createResponse = await fetch(`${MAIL_TM_API}/accounts`, {
            ...FETCH_OPTIONS,
            method: 'POST',
            body: JSON.stringify({
                address: email,
                password: password
            })
        });
        
        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            console.error('[生成邮箱] 创建账户失败:', errorText);
            throw new Error(`创建邮箱账户失败 (${createResponse.status})`);
        }
        
        const accountData = await createResponse.json();
        console.log('[生成邮箱] 账户创建成功:', accountData.address);
        
        const tokenResponse = await fetch(`${MAIL_TM_API}/token`, {
            ...FETCH_OPTIONS,
            method: 'POST',
            body: JSON.stringify({
                address: email,
                password: password
            })
        });
        
        if (!tokenResponse.ok) {
            throw new Error('获取令牌失败');
        }
        
        const tokenData = await tokenResponse.json();
        
        res.json({
            success: true,
            email: accountData.address,
            username: username,
            domain: domain,
            accountId: accountData.id,
            token: tokenData.token,
            password: password
        });
    } catch (error) {
        console.error('[生成邮箱] 错误:', error.message);
        res.status(500).json({
            success: false,
            error: '生成邮箱失败: ' + error.message
        });
    }
});

app.get('/api/get-messages/:email', validateApiKey, async (req, res) => {
    try {
        const { email } = req.params;
        const token = req.headers['x-mail-token'];
        
        if (!token) {
            return res.status(400).json({
                success: false,
                error: '缺少邮件令牌'
            });
        }
        
        console.log(`[获取邮件] 邮箱: ${email}`);
        
        const response = await fetch(`${MAIL_TM_API}/messages`, {
            ...FETCH_OPTIONS,
            headers: {
                ...FETCH_OPTIONS.headers,
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Mail.tm API 错误 (${response.status})`);
        }
        
        const data = await response.json();
        const messages = data['hydra:member'] || [];
        
        console.log(`[获取邮件] 找到 ${messages.length} 封邮件`);
        
        res.json({
            success: true,
            messages: messages.map(msg => ({
                id: msg.id,
                from: msg.from?.address || 'unknown',
                subject: msg.subject,
                date: msg.createdAt,
                intro: msg.intro
            })),
            count: messages.length
        });
    } catch (error) {
        console.error('[获取邮件] 错误:', error.message);
        res.status(500).json({
            success: false,
            error: '获取邮件列表失败: ' + error.message
        });
    }
});

app.get('/api/get-message/:email/:messageId', validateApiKey, async (req, res) => {
    try {
        const { email, messageId } = req.params;
        const token = req.headers['x-mail-token'];
        
        if (!token) {
            return res.status(400).json({
                success: false,
                error: '缺少邮件令牌'
            });
        }
        
        console.log(`[获取邮件详情] 邮箱: ${email}, 消息ID: ${messageId}`);
        
        const response = await fetch(`${MAIL_TM_API}/messages/${messageId}`, {
            ...FETCH_OPTIONS,
            headers: {
                ...FETCH_OPTIONS.headers,
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Mail.tm API 错误 (${response.status})`);
        }
        
        const message = await response.json();
        
        let verificationCode = null;
        const text = message.text || message.html || '';
        const codeMatch = text.match(/\b[A-Z0-9]{6}\b/);
        if (codeMatch) {
            verificationCode = codeMatch[0];
            console.log(`[获取邮件详情] 找到验证码: ${verificationCode}`);
        }
        
        res.json({
            success: true,
            message: {
                id: message.id,
                from: message.from?.address || 'unknown',
                subject: message.subject,
                body: message.text || message.html,
                html: message.html,
                text: message.text,
                date: message.createdAt
            },
            verificationCode: verificationCode
        });
    } catch (error) {
        console.error('[获取邮件详情] 错误:', error.message);
        res.status(500).json({
            success: false,
            error: '获取邮件详情失败: ' + error.message
        });
    }
});

app.get('/api/wait-for-code/:email', validateApiKey, async (req, res) => {
    try {
        const { email } = req.params;
        const token = req.headers['x-mail-token'];
        
        if (!token) {
            return res.status(400).json({
                success: false,
                error: '缺少邮件令牌'
            });
        }
        
        const maxAttempts = 30;
        const interval = 3000;
        
        console.log(`[等待验证码] 开始等待: ${email}`);
        
        res.setTimeout(90000);
        
        let attempts = 0;
        const checkMessages = async () => {
            try {
                const response = await fetch(`${MAIL_TM_API}/messages`, {
                    ...FETCH_OPTIONS,
                    headers: {
                        ...FETCH_OPTIONS.headers,
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`API 错误 (${response.status})`);
                }
                
                const data = await response.json();
                const messages = data['hydra:member'] || [];
                
                if (messages.length > 0) {
                    const latestMessage = messages[0];
                    
                    const detailResponse = await fetch(`${MAIL_TM_API}/messages/${latestMessage.id}`, {
                        ...FETCH_OPTIONS,
                        headers: {
                            ...FETCH_OPTIONS.headers,
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    const detail = await detailResponse.json();
                    
                    let verificationCode = null;
                    const text = detail.text || detail.html || '';
                    const codeMatch = text.match(/\b[A-Z0-9]{6}\b/);
                    if (codeMatch) {
                        verificationCode = codeMatch[0];
                        console.log(`[等待验证码] 找到验证码: ${verificationCode}`);
                    }
                    
                    return res.json({
                        success: true,
                        code: verificationCode,
                        message: {
                            id: detail.id,
                            from: detail.from?.address || 'unknown',
                            subject: detail.subject,
                            body: detail.text || detail.html,
                            date: detail.createdAt
                        }
                    });
                }
                
                attempts++;
                console.log(`[等待验证码] 尝试 ${attempts}/${maxAttempts}`);
                
                if (attempts >= maxAttempts) {
                    return res.status(408).json({
                        success: false,
                        error: '等待验证码超时，请重试'
                    });
                }
                
                setTimeout(checkMessages, interval);
            } catch (error) {
                console.error('[等待验证码] 轮询错误:', error.message);
                return res.status(500).json({
                    success: false,
                    error: '检查邮件时出错: ' + error.message
                });
            }
        };
        
        checkMessages();
    } catch (error) {
        console.error('[等待验证码] 错误:', error.message);
        res.status(500).json({
            success: false,
            error: '等待验证码失败: ' + error.message
        });
    }
});

app.use((err, req, res, next) => {
    console.error('[服务器] 未捕获的错误:', err);
    res.status(500).json({
        success: false,
        error: '服务器内部错误: ' + err.message
    });
});

app.listen(PORT, () => {
    console.log(`🚀 服务器运行在端口 ${PORT}`);
    console.log(`📧 API密钥: ${API_KEY.substring(0, 10)}...`);
    console.log(`🌐 环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📬 使用 Mail.tm API`);
});

module.exports = app;
