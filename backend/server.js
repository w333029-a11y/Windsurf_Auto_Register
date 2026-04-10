const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');

const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'wsr-2024-default-key';

const MAIL_SERVICE = process.env.MAIL_SERVICE || 'auto';

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
    allowedHeaders: ['Content-Type', 'x-api-key', 'X-API-Key', 'x-mail-token'],
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
class TempMailService {
    constructor(name, priority = 1) {
        this.name = name;
        this.priority = priority;
    }
    
    async generateEmail() {
        throw new Error('必须实现 generateEmail 方法');
    }
    
    async getMessages(email, token) {
        throw new Error('必须实现 getMessages 方法');
    }
    
    async getMessage(email, messageId, token) {
        throw new Error('必须实现 getMessage 方法');
    }
    
    extractVerificationCode(text) {
        const patterns = [
            /\b[A-Z0-9]{6}\b/,
            /\b\d{4,6}\b/,
            /code[:\s=]+(\w+)/i,
            /verification code[:\s=]+(\w+)/i,
            /验证码[:\s=]+(\w+)/i,
            /:\s*(\d{4,6})\s*:/i,
            /:\s*([A-Z0-9]{4,6})\s*:/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern, 'i');
            if (match) {
                return match[1] || match[2] || match[3];
            }
        }
        return null;
    }
}

class TempMailOrg extends TempMailService {
    constructor() {
        super('TempMail.org', 2);
        this.apiUrl = 'https://www.1secmail.com/api/v1/';
    }
    
    async generateEmail() {
        try {
            const response = await fetch(`${this.apiUrl}?action=genRandomMailbox&count=1`, FETCH_OPTIONS);
            
            if (!response.ok) {
                throw new Error(`API 错误 (${response.status})`);
            }
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                const email = data[0];
                const [username, domain] = email.split('@');
                return {
                    success: true,
                    email: email,
                    username: username,
                    domain: domain,
                    token: null
                };
            }
            throw new Error('生成邮箱失败');
        } catch (error) {
            console.error(`[${this.name}] 生成邮箱错误:`, error.message);
            throw error;
        }
    }
    
    async getMessages(email, token) {
        try {
            const [username, domain] = email.split('@');
            const response = await fetch(
                `${this.apiUrl}?action=getMessages&login=${username}&domain=${domain}`,
                FETCH_OPTIONS
            );
            
            if (!response.ok) {
                throw new Error(`API 错误 (${response.status})`);
            }
            
            const messages = await response.json();
            
            return {
                success: true,
                messages: (messages || []).map(msg => ({
                    id: msg.id,
                    from: msg.from,
                    subject: msg.subject,
                    date: msg.date
            })),
                count: messages ? messages.length : 0
            };
        } catch (error) {
            console.error(`[${this.name}] 获取邮件错误:`, error.message);
            throw error;
        }
    }
    
    async getMessage(email, messageId, token) {
        try {
            const [username, domain] = email.split('@');
            const response = await fetch(
                `${this.apiUrl}?action=readMessage&login=${username}&domain=${domain}&id=${messageId}`,
                FETCH_OPTIONS
            );
            
            if (!response.ok) {
                throw new Error(`API 错误 (${response.status})`);
            }
            
            const message = await response.json();
            const verificationCode = this.extractVerificationCode(message.body || '');
            
            return {
                success: true,
                message: {
                    id: message.id,
                    from: message.from,
                    subject: message.subject,
                    body: message.body,
                    text: message.text || message.body,
                    date: message.date
                },
                verificationCode: verificationCode
            };
        } catch (error) {
            console.error(`[${this.name}] 获取邮件详情错误:`, error.message);
            throw error;
        }
    }
}

class GuerrillaMail extends TempMailService {
    constructor() {
        super('Guerrilla Mail', 1);
        this.apiUrl = 'https://api.guerrillamail.com';
    }
    
    async generateEmail() {
        try {
        const response = await fetch(`${this.apiUrl}/ajax.php?f=gen_email`, FETCH_OPTIONS);
            
            if (!response.ok) {
                throw new Error(`API 错误 (${response.status})`);
            }
            
            const email = await response.text();
            const [username, domain] = email.split('@');
            
            return {
                success: true,
                email: email,
                username: username,
                domain: domain,
                token: null
            };
        } catch (error) {
            console.error(`[${this.name}] 生成邮箱错误:`, error.message);
            throw error;
        }
    }
    
    async getMessages(email, token) {
        try {
            const [username, domain] = email.split('@');
            const response = await fetch(
                `${this.apiUrl}/ajax.php?f=check_email&seq=1&email_user=${username}&domain=${domain}`,
                FETCH_OPTIONS
            );
            
            if (!response.ok) {
                throw new Error(`API 错误 (${response.status})`);
            }
            
            const data = await response.text();
            const lines = data.split('\n');
            const messages = [];
            
            for (const line of lines) {
                if (line.includes('|')) {
                    const parts = line.split('|');
                    if (parts.length >= 3) {
                        messages.push({
                            id: parts[0],
                            from: parts[1],
                            subject: parts[2],
                            date: new Date().toISOString()
                        });
                    }
                }
            }
            
            return {
                success: true,
                messages: messages,
                count: messages.length
            };
        } catch (error) {
            console.error(`[${this.name}] 获取邮件错误:`, error.message);
            throw error;
        }
    }
    
    async getMessage(email, messageId, token) {
        try {
            const response = await fetch(
                `${this.apiUrl}/ajax.php?f=fetch_email&email_id=${messageId}`,
                FETCH_OPTIONS
            );
            
            if (!response.ok) {
                throw new Error(`API 错误 (${response.status})`);
            }
            
            const data = await response.text();
            const verificationCode = this.extractVerificationCode(data);
            
            return {
                success: true,
                message: {
                    id: messageId,
                    from: 'unknown',
                    subject: 'Email',
                    body: data,
                    text: data,
                    date: new Date().toISOString()
                },
                verificationCode: verificationCode
            };
        } catch (error) {
            console.error(`[${this.name}] 获取邮件详情错误:`, error.message);
            throw error;
        }
    }
}

class TempMailPlus extends TempMailService {
    constructor() {
        super('TempMail.plus', 3);
        this.apiUrl = 'https://tempmail.plus/api';
        this.emailId = null;
    }
    
    async generateEmail() {
        try {
            const emailId = crypto.randomBytes(10).toString('hex');
            this.emailId = emailId;
            
            const response = await fetch(`${this.apiUrl}/mails/${emailId}`, {
                ...FETCH_OPTIONS,
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`API 错误 (${response.status})`);
            }
            
            const data = await response.json();
            const email = data.mail || `${emailId}@tempmail.plus`;
            const [username, domain] = email.split('@');
            
            return {
                success: true,
                email: email,
                username: username,
                domain: domain,
                token: emailId
            };
        } catch (error) {
            console.error(`[${this.name}] 生成邮箱错误:`, error.message);
            throw error;
        }
    }
    
    async getMessages(email, token) {
        try {
            const emailId = token || this.emailId;
            
            const response = await fetch(`${this.apiUrl}/mails/${emailId}`, FETCH_OPTIONS);
            
            if (!response.ok) {
                throw new Error(`API 错误 (${response.status})`);
            }
            
            const data = await response.json();
            const messages = (data.mail_list || []).map(msg => ({
                id: msg.id || msg.mail_id,
                from: msg.from || 'unknown',
                subject: msg.subject || msg.title,
                date: msg.time || msg.date,
                intro: msg.excerpt || msg.intro
            }));
            
            return {
                success: true,
                messages: messages,
                count: messages.length
            };
        } catch (error) {
            console.error(`[${this.name}] 获取邮件错误:`, error.message);
            throw error;
        }
    }
    
    async getMessage(email, messageId, token) {
        try {
            const emailId = token || this.emailId;
            
            const response = await fetch(`${this.apiUrl}/mails/${emailId}/${messageId}`, FETCH_OPTIONS);
            
            if (!response.ok) {
                throw new Error(`API 错误 (${response.status})`);
            }
            
            const message = await response.json();
            const verificationCode = this.extractVerificationCode(message.text || message.html || '');
            
            return {
                success: true,
                message: {
                    id: messageId,
                    from: message.from || 'unknown',
                    subject: message.subject || message.title,
                    body: message.text || message.html,
                    text: message.text,
                    date: message.time || message.date
                },
                verificationCode: verificationCode
            };
        } catch (error) {
            console.error(`[${this.name}] 获取邮件详情错误:`, error.message);
            throw error;
        }
    }
}

class MailTm extends TempMailService {
    constructor() {
        super('Mail.tm', 4);
        this.apiUrl = 'https://api.mail.tm';
        this.cachedDomains = null;
        this.domainCacheTime = 0;
    }
    
    async getDomains() {
        const now = Date.now();
        if (this.cachedDomains && (now - this.domainCacheTime) < 3600000) {
            return this.cachedDomains;
        }
        
        try {
            console.log(`[${this.name}] 获取可用域名...`);
            const response = await fetch(`${this.apiUrl}/domains`, FETCH_OPTIONS);
            const data = await response.json();
            
            if (data['hydra:member'] && data['hydra:member'].length > 0) {
                const domains = data['hydra:member']
                    .filter(d => d.isActive && !d.isPrivate)
                    .map(d => d.domain);
                
                if (domains.length > 0) {
                    this.cachedDomains = domains;
                    this.domainCacheTime = now;
                    console.log(`[${this.name}] 可用域名:`, domains);
                    return this.cachedDomains;
                }
            }
            
            console.log(`[${this.name}] 使用备用域名`);
            return ['deltajohnsons.com', 'mailtoplus.com'];
        } catch (error) {
            console.error(`[${this.name}] 获取域名错误:`, error.message);
            return ['deltajohnsons.com', 'mailtoplus.com'];
        }
    }
    
    async generateEmail() {
        try {
            const domains = await this.getDomains();
            const domain = domains[0];
            
            const username = 'user' + Math.random().toString(36).substring(2, 10);
            const email = `${username}@${domain}`;
            const password = 'Pass' + Math.random().toString(36).substring(2, 10) + '!@#';
            
            const createResponse = await fetch(`${this.apiUrl}/accounts`, {
                ...FETCH_OPTIONS,
                method: 'POST',
                body: JSON.stringify({
                    address: email,
                    password: password
                })
            });
            
            if (!createResponse.ok) {
                const errorText = await createResponse.text();
                console.error(`[${this.name}] 创建账户失败:`, errorText);
                throw new Error(`创建邮箱账户失败 (${createResponse.status})`);
            }
            
            const accountData = await createResponse.json();
            console.log(`[${this.name}] 账户创建成功:`, accountData.address);
            
            const tokenResponse = await fetch(`${this.apiUrl}/token`, {
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
            
            return {
                success: true,
                email: accountData.address,
                username: username,
                domain: domain,
                accountId: accountData.id,
                token: tokenData.token,
                password: password
            };
        } catch (error) {
            console.error(`[${this.name}] 生成邮箱错误:`, error.message);
            throw error;
        }
    }
    
    async getMessages(email, token) {
        try {
            const response = await fetch(`${this.apiUrl}/messages`, {
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
            
            return {
                success: true,
                messages: messages.map(msg => ({
                id: msg.id,
                from: msg.from?.address || 'unknown',
                subject: msg.subject,
                date: msg.createdAt,
                intro: msg.intro
            })),
                count: messages.length
            };
        } catch (error) {
            console.error(`[${this.name}] 获取邮件错误:`, error.message);
            throw error;
        }
    }
    
    async getMessage(email, messageId, token) {
        try {
            const response = await fetch(`${this.apiUrl}/messages/${messageId}`, {
                ...FETCH_OPTIONS,
                headers: {
                    ...FETCH_OPTIONS.headers,
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`API 错误 (${response.status})`);
            }
            
            const message = await response.json();
            const verificationCode = this.extractVerificationCode(message.text || message.html || '');
            
            return {
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
            };
        } catch (error) {
            console.error(`[${this.name}] 获取邮件详情错误:`, error.message);
            throw error;
        }
    }
}

const mailServices = [
    new TempMailOrg(),
    new GuerrillaMail(),
    new TempMailPlus(),
    new MailTm()
];
async function tryServices(operation, email, token) {
    const sortedServices = [...mailServices].sort((a, b) => a.priority - b.priority);
    
    for (const service of sortedServices) {
        try {
            console.log(`[尝试服务] 使用 ${service.name}...`);
            const result = await operation(service, email, token);
            console.log(`[尝试服务] ${service.name} 成功!`);
            return { service: service.name, result };
        } catch (error) {
            console.error(`[尝试服务] ${service.name} 失败:`, error.message);
            continue;
        }
    }
    
    throw new Error('所有邮件服务都失败了');
}
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '服务运行正常',
        timestamp: new Date().toISOString(),
        apiKey: API_KEY.substring(0, 10) + '...',
        service: MAIL_SERVICE,
        availableServices: mailServices.map(s => s.name)
    });
});
app.post('/api/generate-email', validateApiKey, async (req, res) => {
    try {
        console.log('[生成邮箱] 开始...');
        
        const { service: serviceName, result } = await tryServices(
            async (service) => service.generateEmail()
        );
        
        res.json({
            success: true,
            ...result,
            service: serviceName
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
        
        console.log(`[获取邮件] 邮箱: ${email}`);
        
        const { service: serviceName, result } = await tryServices(
            async (service) => service.getMessages(email, token)
        );
        
        res.json({
            success: true,
            ...result,
            service: serviceName
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
        
        console.log(`[获取邮件详情] 邮箱: ${email}, 消息ID: ${messageId}`);
        
        const { service: serviceName, result } = await tryServices(
            async (service) => service.getMessage(email, messageId, token)
        );
        
        res.json({
            success: true,
            ...result,
            service: serviceName
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
        
        const maxAttempts = 30;
        const interval = 3000;
        
        console.log(`[等待验证码] 开始等待: ${email}`);
        
        res.setTimeout(90000);
        
        let attempts = 0;
        const checkMessages = async () => {
            try {
                const { service: serviceName, result } = await tryServices(
                    async (service) => service.getMessages(email, token)
                );
                
                const messages = result.messages;
                
                if (messages && messages.length > 0) {
                    const latestMessage = messages[0];
                    
                    const { result: detail } = await tryServices(
                        async (service) => service.getMessage(email, latestMessage.id, token)
                    );
                    
                    const verificationCode = detail.verificationCode;
                    
                    if (verificationCode) {
                        console.log(`[等待验证码] 找到验证码: ${verificationCode}`);
                    }
                    
                    return res.json({
                        success: true,
                        code: verificationCode,
                        message: detail.message,
                        service: serviceName
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
    console.log(`📬 可用邮件服务: ${mailServices.map(s => s.name).join(', ')}`);
});
module.exports = app;
