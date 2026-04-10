const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'wsr-2024-default-key';

// 安全中间件
app.use(helmet());

// CORS配置
app.use(cors({
    origin: ['https://windsurf.com', 'https://*.windsurf.com', 'chrome-extension://*'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-api-key']
}));

// 限流配置
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 每个IP最多100个请求
    message: { success: false, error: '请求过于频繁，请稍后再试' }
});
app.use(limiter);

app.use(express.json());

// API密钥验证中间件
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

// 健康检查
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '服务运行正常',
        timestamp: new Date().toISOString()
    });
});

// 生成临时邮箱
app.post('/api/generate-email', validateApiKey, async (req, res) => {
    try {
        const response = await fetch('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
        const data = await response.json();
        
        if (data && data.length > 0) {
            const email = data[0];
            const [username, domain] = email.split('@');
            
            res.json({
                success: true,
                email: email,
                username: username,
                domain: domain
            });
        } else {
            throw new Error('生成邮箱失败');
        }
    } catch (error) {
        console.error('生成邮箱错误:', error);
        res.status(500).json({
            success: false,
            error: '生成邮箱失败: ' + error.message
        });
    }
});

// 获取邮件列表
app.get('/api/get-messages/:email', validateApiKey, async (req, res) => {
    try {
        const { email } = req.params;
        const [username, domain] = email.split('@');
        
        if (!username || !domain) {
            return res.status(400).json({
                success: false,
                error: '无效的邮箱格式'
            });
        }
        
        const response = await fetch(
            `https://www.1secmail.com/api/v1/?action=getMessages&login=${username}&domain=${domain}`
        );
        const messages = await response.json();
        
        res.json({
            success: true,
            messages: messages || [],
            count: messages ? messages.length : 0
        });
    } catch (error) {
        console.error('获取邮件列表错误:', error);
        res.status(500).json({
            success: false,
            error: '获取邮件列表失败: ' + error.message
        });
    }
});

// 获取邮件详情
app.get('/api/get-message/:email/:messageId', validateApiKey, async (req, res) => {
    try {
        const { email, messageId } = req.params;
        const [username, domain] = email.split('@');
        
        if (!username || !domain) {
            return res.status(400).json({
                success: false,
                error: '无效的邮箱格式'
            });
        }
        
        const response = await fetch(
            `https://www.1secmail.com/api/v1/?action=readMessage&login=${username}&domain=${domain}&id=${messageId}`
        );
        const message = await response.json();
        
        // 提取验证码
        let verificationCode = null;
        if (message && message.body) {
            //  Windsurf 验证码格式：通常是 6 位数字或字母
            const codeMatch = message.body.match(/\b[A-Z0-9]{6}\b/);
            if (codeMatch) {
                verificationCode = codeMatch[0];
            }
        }
        
        res.json({
            success: true,
            message: message,
            verificationCode: verificationCode
        });
    } catch (error) {
        console.error('获取邮件详情错误:', error);
        res.status(500).json({
            success: false,
            error: '获取邮件详情失败: ' + error.message
        });
    }
});

// 等待验证码（轮询）
app.get('/api/wait-for-code/:email', validateApiKey, async (req, res) => {
    try {
        const { email } = req.params;
        const maxAttempts = 30; // 最多尝试30次
        const interval = 3000; // 每3秒检查一次
        
        const [username, domain] = email.split('@');
        
        if (!username || !domain) {
            return res.status(400).json({
                success: false,
                error: '无效的邮箱格式'
            });
        }
        
        // 设置响应超时（90秒）
        res.setTimeout(90000);
        
        let attempts = 0;
        const checkMessages = async () => {
            try {
                const response = await fetch(
                    `https://www.1secmail.com/api/v1/?action=getMessages&login=${username}&domain=${domain}`
                );
                const messages = await response.json();
                
                if (messages && messages.length > 0) {
                    // 获取最新邮件的详情
                    const latestMessage = messages[0];
                    const detailResponse = await fetch(
                        `https://www.1secmail.com/api/v1/?action=readMessage&login=${username}&domain=${domain}&id=${latestMessage.id}`
                    );
                    const detail = await detailResponse.json();
                    
                    // 提取验证码
                    let verificationCode = null;
                    if (detail && detail.body) {
                        const codeMatch = detail.body.match(/\b[A-Z0-9]{6}\b/);
                        if (codeMatch) {
                            verificationCode = codeMatch[0];
                        }
                    }
                    
                    return res.json({
                        success: true,
                        code: verificationCode,
                        message: detail
                    });
                }
                
                attempts++;
                if (attempts >= maxAttempts) {
                    return res.status(408).json({
                        success: false,
                        error: '等待验证码超时，请重试'
                    });
                }
                
                // 继续轮询
                setTimeout(checkMessages, interval);
            } catch (error) {
                console.error('轮询错误:', error);
                return res.status(500).json({
                    success: false,
                    error: '检查邮件时出错: ' + error.message
                });
            }
        };
        
        // 开始轮询
        checkMessages();
    } catch (error) {
        console.error('等待验证码错误:', error);
        res.status(500).json({
            success: false,
            error: '等待验证码失败: ' + error.message
        });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        error: '服务器内部错误'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在端口 ${PORT}`);
    console.log(`📧 API密钥: ${API_KEY.substring(0, 10)}...`);
    console.log(`🌐 环境: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
