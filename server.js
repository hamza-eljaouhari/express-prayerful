const express = require('express');
const dotenv = require('dotenv');
const fs = require('fs');
const util = require('util');
const OpenAI = require('openai');
const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { createCanvas, loadImage, registerFont } = require('canvas');
const GIFEncoder = require('gif-encoder');

dotenv.config();

const app = express();
app.use(express.json());
// Enable CORS for all routes
app.use(cors());

const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
});

const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Register the custom font
registerFont('fonts/Ubuntu-Regular.ttf', { family: 'Ubuntu' });

// Translated writers
const writers = {
    "english":  [
        "William Shakespeare", "Jane Austen", "Charles Dickens", "Leo Tolstoy", "Mark Twain",
        "Homer", "Edgar Allan Poe", "J.K. Rowling", "George Orwell", "Ernest Hemingway",
        "Fyodor Dostoevsky", "Emily Dickinson", "Virginia Woolf", "James Joyce",
        "Franz Kafka", "F. Scott Fitzgerald", "Herman Melville", "T.S. Eliot", "John Steinbeck",
        "Oscar Wilde", "Mary Shelley", "H.G. Wells", "George Eliot", "Thomas Hardy",
        "Ralph Waldo Emerson", "Henry David Thoreau", "Walt Whitman", "Robert Frost", "Maya Angelou",
        "Sylvia Plath", "Toni Morrison", "Harper Lee", "Kurt Vonnegut", "Ray Bradbury",
        "J.R.R. Tolkien", "C.S. Lewis", "Isaac Asimov", "Arthur C. Clarke", "Philip K. Dick",
        "Margaret Atwood", "Ursula K. Le Guin", "Aldous Huxley", "H.P. Lovecraft", "Agatha Christie",
        "Arthur Conan Doyle", "J.D. Salinger", "Jack Kerouac", "Ernest J. Gaines", "Octavia E. Butler",
        "Vladimir Nabokov", "E. E. Cummings", "D.H. Lawrence", "William Faulkner", "Tennessee Williams",
        "L. Frank Baum", "Louisa May Alcott", "Jules Verne", "Robert Louis Stevenson", "Nathaniel Hawthorne",
        "Charles Baudelaire", "Marcel Proust", "Albert Camus", "Jean-Paul Sartre", "Simone de Beauvoir",
        "Gabriel Garcia Marquez", "Isabel Allende", "Pablo Neruda", "Jorge Luis Borges", "Carlos Fuentes",
        "Mario Vargas Llosa", "Miguel de Cervantes", "Edith Wharton", "Thomas Mann", "Herman Hesse"
    ],
    "french": [
        "William Shakespeare", "Jane Austen", "Charles Dickens", "Léon Tolstoï", "Mark Twain",
        "Homère", "Edgar Allan Poe", "J.K. Rowling", "George Orwell", "Ernest Hemingway",
        "Fiodor Dostoïevski", "Emily Dickinson", "Virginia Woolf", "James Joyce",
        "Franz Kafka", "F. Scott Fitzgerald", "Herman Melville", "T.S. Eliot", "John Steinbeck",
        "Oscar Wilde", "Mary Shelley", "H.G. Wells", "George Eliot", "Thomas Hardy",
        "Ralph Waldo Emerson", "Henry David Thoreau", "Walt Whitman", "Robert Frost", "Maya Angelou",
        "Sylvia Plath", "Toni Morrison", "Harper Lee", "Kurt Vonnegut", "Ray Bradbury",
        "J.R.R. Tolkien", "C.S. Lewis", "Isaac Asimov", "Arthur C. Clarke", "Philip K. Dick",
        "Margaret Atwood", "Ursula K. Le Guin", "Aldous Huxley", "H.P. Lovecraft", "Agatha Christie",
        "Arthur Conan Doyle", "J.D. Salinger", "Jack Kerouac", "Ernest J. Gaines", "Octavia E. Butler",
        "Vladimir Nabokov", "E. E. Cummings", "D.H. Lawrence", "William Faulkner", "Tennessee Williams",
        "L. Frank Baum", "Louisa May Alcott", "Jules Verne", "Robert Louis Stevenson", "Nathaniel Hawthorne",
        "Charles Baudelaire", "Marcel Proust", "Albert Camus", "Jean-Paul Sartre", "Simone de Beauvoir",
        "Gabriel Garcia Marquez", "Isabel Allende", "Pablo Neruda", "Jorge Luis Borges", "Carlos Fuentes",
        "Mario Vargas Llosa", "Miguel de Cervantes", "Edith Wharton", "Thomas Mann", "Hermann Hesse"
    ],
    "arabic": [
        "ويليام شكسبير", "جين أوستن", "تشارلز ديكنز", "ليو تولستوي", "مارك توين",
        "هوميروس", "إدغار آلان بو", "ج. ك. رولينج", "جورج أورويل", "إرنست همنغواي",
        "فيودور دوستويفسكي", "إميلي ديكنسون", "فرجينيا وولف", "جيمس جويس",
        "فرانز كافكا", "ف. سكوت فيتزجيرالد", "هيرمان ملفيل", "ت. س. إليوت", "جون شتاينبك",
        "أوسكار وايلد", "ماري شيلي", "هـ. ج. ويلز", "جورج إليوت", "توماس هاردي",
        "رالف والدو إمرسون", "هنري ديفيد ثورو", "والت ويتمان", "روبرت فروست", "مايا أنجيلو",
        "سيلفيا بلاث", "توني موريسون", "هاربر لي", "كورت فونيجت", "راي برادبري",
        "ج.ر.ر. تولكين", "سي. إس. لويس", "إسحاق أسيموف", "آرثر سي كلارك", "فيليب ك. ديك",
        "مارغريت أتوود", "أورسولا ك. لي جوين", "ألدوس هكسلي", "هـ. ب. لوفكرافت", "أجاثا كريستي",
        "آرثر كونان دويل", "ج. د. سالينجر", "جاك كيرواك", "إرنست جي. غينز", "أوكتافيا إي. باتلر",
        "فلاديمير نابوكوف", "إي. إي. كامينغز", "د. هـ. لورانس", "ويليام فوكنر", "تينيسي ويليامز",
        "ل. فرانك بوم", "لويزا ماي ألكوت", "جول فيرن", "روبرت لويس ستيفنسون", "ناثانيال هاوثورن",
        "تشارلز بودلير", "مارسيل بروست", "ألبرت كامو", "جان بول سارتر", "سيمون دي بوفوار",
        "جابرييل جارسيا ماركيز", "إيزابيل الليندي", "بابلو نيرودا", "خورخي لويس بورخيس", "كارلوس فوينتس",
        "ماريو فارغاس يوسا", "ميغيل دي ثيربانتس", "إديث وارتون", "توماس مان", "هيرمان هيسه"
    ]
};

const topics = {
    "english": [
        "gratitude", "forgiveness", "healing", "strength", "protection",
        "guidance", "peace", "love", "compassion", "courage",
        "wisdom", "patience", "faith", "hope", "charity", "kindness",
        "understanding", "reconciliation", "unity", "humility",
        "mercy", "justice", "truth", "joy", "grace", "devotion",
        "reverence", "redemption", "salvation", "praise", "thanksgiving",
        "intercession", "confession", "consecration", "dedication",
        "adoration", "benediction", "petition", "supplication",
        "lamentation", "meditation", "reflection", "renewal",
        "revival", "restoration", "sanctification", "deliverance",
        "enlightenment", "faithfulness", "fidelity", "sincerity",
        "sobriety", "chastity", "simplicity", "stewardship", "evangelism",
        "discipleship", "servanthood", "mission", "vocation", "ministry",
        "fellowship", "community", "family", "marriage", "parenting",
        "friendship", "work", "school", "learning", "teaching", "growth",
        "maturity", "perseverance", "endurance", "provision", "safety",
        "peacekeeping", "defense", "healing of nations", "environment",
        "creation", "animal welfare", "agriculture", "science",
        "technology", "arts", "literature", "music", "sports", "leisure",
        "health", "mental health", "well-being", "prosperity", "wealth",
        "poverty", "equality", "freedom", "human rights", "democracy",
        "government", "leadership"
    ],
    "french": [
        "gratitude", "pardon", "guérison", "force", "protection",
        "guidance", "paix", "amour", "compassion", "courage",
        "sagesse", "patience", "foi", "espoir", "charité", "gentillesse",
        "compréhension", "réconciliation", "unité", "humilité",
        "miséricorde", "justice", "vérité", "joie", "grâce", "dévotion",
        "révérence", "rédemption", "salut", "louange", "remerciement",
        "intercession", "confession", "consécration", "dédicace",
        "adoration", "bénédiction", "pétition", "supplication",
        "lamentation", "méditation", "réflexion", "renouvellement",
        "réveil", "restauration", "sanctification", "délivrance",
        "illumination", "fidélité", "sincérité", "sobriété",
        "chasteté", "simplicité", "gérance", "évangélisation",
        "discipulat", "servitude", "mission", "vocation", "ministère",
        "communion", "communauté", "famille", "mariage", "parentalité",
        "amitié", "travail", "école", "apprentissage", "enseignement", "croissance",
        "maturité", "persévérance", "endurance", "provision", "sécurité",
        "maintien de la paix", "défense", "guérison des nations", "environnement",
        "création", "bien-être animal", "agriculture", "science",
        "technologie", "arts", "littérature", "musique", "sports", "loisirs",
        "santé", "santé mentale", "bien-être", "prospérité", "richesse",
        "pauvreté", "égalité", "liberté", "droits de l'homme", "démocratie",
        "gouvernement", "leadership"
    ],
    "arabic": [
        "الامتنان", "المغفرة", "الشفاء", "القوة", "الحماية",
        "الإرشاد", "السلام", "الحب", "الشجاعة",
        "الحكمة", "الصبر", "الإيمان", "الأمل", "الصدقة", "اللطف",
        "الفهم", "المصالحة", "الوحدة", "التواضع",
        "الرحمة", "العدالة", "الحق", "الفرح", "النعمة",
        "الإجلال", "الفداء", "الخلاص", "التسبيح", "الشكر",
        "الشفاعة", "الاعتراف", "التكريس", "التفاني",
        "العبادة", "البركة", "الطلب", "التضرع",
        "الرثاء", "التأمل", "التفكر", "التجديد",
        "اليقظة", "الاستعادة", "التقديس", "النجاة",
        "التنوير", "الإخلاص", "الوفاء",
        "الرصانة", "العفة", "البساطة", "الإشراف", "التبشير",
        "التلمذة", "الخدمة", "المهمة", "الدعوة",
        "الزمالة", "المجتمع", "الأسرة", "الزواج", "الأبوة",
        "الصداقة", "العمل", "المدرسة", "التعلم", "التدريس", "النمو",
        "النضج", "المثابرة", "التحمل", "التوفير", "السلامة",
        "حفظ السلام", "الدفاع", "شفاء الأمم", "البيئة",
        "الخلق", "رعاية الحيوان", "الزراعة", "العلم",
        "التكنولوجيا", "الفنون", "الأدب", "الموسيقى", "الرياضة", "الترفيه",
        "الصحة", "الصحة النفسية", "الرفاهية", "الازدهار", "الثروة",
        "الفقر", "المساواة", "الحرية", "حقوق الإنسان", "الديمقراطية",
        "الحكومة", "القيادة"
    ]
};

const languagePrompts = {
    "english": "Generate a prayer about",
    "french": "Générer une prière à propos de",
    "arabic": "توليد صلاة حول"
};

const voices = {
    "english": { languageCode: "en-US", name: "en-US-Wavenet-D" },
    "french": { languageCode: "fr-FR", name: "fr-FR-Wavenet-A" },
    "arabic": { languageCode: "ar-XA", name: "ar-XA-Wavenet-A" }
};

// Get topics based on language
app.get('/topics', (req, res) => {
    const { language } = req.query;
    if (topics[language]) {
        res.json(topics[language]);
    } else {
        res.status(400).send('Invalid language');
    }
});

// Get writers based on language
app.get('/writers', (req, res) => {
    const { language } = req.query;
    if (writers[language]) {
        res.json(writers[language]);
    } else {
        res.status(400).send('Invalid language');
    }
});

const uploadFiles = async (prayer, audioBuffer, language) => {
    const uniqueId = uuidv4();
    const audioFilePath = `output-${uniqueId}-${language}.mp3`;
    const textFilePath = `prayer-${uniqueId}-${language}.txt`;

    const writeFile = util.promisify(fs.writeFile);
    await writeFile(audioFilePath, audioBuffer);
    await writeFile(textFilePath, prayer);

    const audioFileStream = fs.createReadStream(audioFilePath);
    const textFileStream = fs.createReadStream(textFilePath);

    const uploadAudioParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: audioFilePath,
        Body: audioFileStream,
        ContentType: 'audio/mp3',
        ACL: 'public-read',
    };

    const uploadTextParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: textFilePath,
        Body: textFileStream,
        ContentType: 'text/plain',
        ACL: 'public-read',
    };

    await s3Client.send(new PutObjectCommand(uploadAudioParams));
    await s3Client.send(new PutObjectCommand(uploadTextParams));

    const audioUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${audioFilePath}`;
    const textUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${textFilePath}`;

    // Cleanup: delete the local files
    fs.unlinkSync(audioFilePath);
    fs.unlinkSync(textFilePath);

    return { audioUrl, textUrl };
};


app.post('/generate-poster', async (req, res) => {
    const { text, format, background } = req.body;
    try {
        const canvas = createCanvas(800, 600);
        const ctx = canvas.getContext('2d');

        const bgImage = await loadImage(`backgrounds/${background}`);
        const imgWidth = bgImage.width;
        const imgHeight = bgImage.height;
        const scaleFactor = Math.min(canvas.width / imgWidth, canvas.height / imgHeight) * 0.6;
        const scaledWidth = imgWidth * scaleFactor;
        const scaledHeight = imgHeight * scaleFactor;
        const xOffset = (canvas.width - scaledWidth) / 2;
        const yOffset = (canvas.height - scaledHeight) / 2;

        ctx.drawImage(bgImage, xOffset, yOffset, scaledWidth, scaledHeight);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '30px Ubuntu';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const buffer = canvas.toBuffer(`image/${format}`);
        if (!buffer) {
            throw new Error('Failed to create buffer from canvas');
        }
        const fileName = `poster-${uuidv4()}.${format}`;
        const filePath = `/tmp/${fileName}`;

        fs.writeFileSync(filePath, buffer);

        const fileStream = fs.createReadStream(filePath);

        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: fileName,
            Body: fileStream,
            ContentType: `image/${format}`,
            ACL: 'public-read',
        };

        await s3Client.send(new PutObjectCommand(uploadParams));

        const fileUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

        fs.unlinkSync(filePath);

        res.json({ fileUrl });
    } catch (error) {
        console.error('Error generating poster:', error);
        res.status(500).send('Error generating poster');
    }
});

app.post('/generate-gif', async (req, res) => {
    const { text, background } = req.body;
    try {
        const encoder = new GIFEncoder(800, 600);
        const filePath = `/tmp/animation-${uuidv4()}.gif`;
        const stream = fs.createWriteStream(filePath);

        encoder.createReadStream().pipe(stream);

        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(500);
        encoder.setQuality(10);

        for (let i = 0; i < 10; i++) {
            const canvas = createCanvas(800, 600);
            const ctx = canvas.getContext('2d');

            const bgImage = await loadImage(`backgrounds/${background}`);
            const imgWidth = bgImage.width;
            const imgHeight = bgImage.height;
            const scaleFactor = Math.min(canvas.width / imgWidth, canvas.height / imgHeight) * 0.6;
            const scaledWidth = imgWidth * scaleFactor;
            const scaledHeight = imgHeight * scaleFactor;
            const xOffset = (canvas.width - scaledWidth) / 2;
            const yOffset = (canvas.height - scaledHeight) / 2;

            ctx.drawImage(bgImage, xOffset, yOffset, scaledWidth, scaledHeight);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = '30px Ubuntu';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, canvas.width / 2, canvas.height / 2 + i * 10);

            encoder.addFrame(ctx);
        }

        encoder.finish();

        stream.on('close', async () => {
            const fileStream = fs.createReadStream(filePath);

            const uploadParams = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: `animation-${uuidv4()}.gif`,
                Body: fileStream,
                ContentType: 'image/gif',
                ACL: 'public-read',
            };

            await s3Client.send(new PutObjectCommand(uploadParams));

            const fileUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/animation-${uuidv4()}.gif`;

            fs.unlinkSync(filePath);

            res.json({ fileUrl });
        });
    } catch (error) {
        console.error('Error generating GIF:', error);
        res.status(500).send('Error generating GIF');
    }
});

app.post('/generate-prayer', async (req, res) => {
    const { topic, writer, language } = req.body;

    if (!topics[language] || !topics[language].includes(topic)) {
        return res.status(400).send('Invalid topic');
    }

    if (!writers[language] || !writers[language].includes(writer)) {
        return res.status(400).send('Invalid writer');
    }

    try {
        const prompt = `${languagePrompts[language]} ${topic}`;
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
        });

        const prayer = response.choices[0].message.content.trim();
        const voiceConfig = voices[language];

        const ttsPayload = {
            input: { text: prayer },
            voice: { name: voiceConfig.name, languageCode: voiceConfig.languageCode, ssmlGender: 'FEMALE' },
            audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 },
        };

        const ttsResponse = await axios.post(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_API_KEY}`,
            ttsPayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                }
            }
        );

        const audioContent = ttsResponse.data.audioContent;
        const audioBuffer = Buffer.from(audioContent, 'base64');
        const { audioUrl, textUrl } = await uploadFiles(prayer, audioBuffer, language);

        res.json({ prayer, audioUrl, textUrl, language });

    } catch (error) {
        console.error('Error generating prayer and audio:', error.response ? error.response.data : error.message);
        res.status(500).send('Error generating prayer and audio');
    }
});

app.get('/list-prayers', async (req, res) => {
    try {
        const command = new ListObjectsV2Command({
            Bucket: process.env.S3_BUCKET_NAME,
        });

        const response = await s3Client.send(command);

        const prayers = await Promise.all(response.Contents.map(async (item) => {
            const key = item.Key;
            const url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
            if (key.endsWith('.mp3')) {
                const textKey = key.replace('.mp3', '.txt').replace('output', 'prayer');
                const textCommand = new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: textKey });
                const textResponse = await s3Client.send(textCommand);
                const textStream = textResponse.Body;
                let textData = '';

                for await (const chunk of textStream) {
                    textData += chunk;
                }

                return { audioUrl: url, textUrl: url.replace('.mp3', '.txt').replace('output', 'prayer'), text: textData };
            }
        }));

        res.json({ prayers: prayers.filter(prayer => prayer !== undefined) });
    } catch (error) {
        console.error('Error listing prayers:', error);
        res.status(500).send('Error listing prayers');
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));