const express = require('express');
const dotenv = require('dotenv');
const fs = require('fs');
const util = require('util');
const OpenAI = require('openai');
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
});

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const topics = [
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
];

const writers = [
    "William Shakespeare", "Jane Austen", "Charles Dickens", "Leo Tolstoy", "Mark Twain",
    "Homer", "Edgar Allan Poe", "J.K. Rowling", "George Orwell", "Ernest Hemingway",
    "Fyodor Dostoevsky", "Emily Dickinson", "Virginia Woolf", "James Joyce", "Gabriel Garcia Marquez",
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
];

const languages = {
    "english": "en",
    "french": "fr",
    "arabic": "ar"
};

const voices = {
    "english": { languageCode: "en-US", name: "en-US-Wavenet-D" },
    "french": { languageCode: "fr-FR", name: "fr-FR-Wavenet-A" },
    "arabic": { languageCode: "ar-XA", name: "ar-XA-Wavenet-A" }
};

app.post('/generate-prayer', async (req, res) => {
    const { topic, writer, language } = req.body;

    if (!topics.includes(topic)) {
        return res.status(400).send('Invalid topic');
    }

    if (!writers.includes(writer)) {
        return res.status(400).send('Invalid writer');
    }

    if (!languages.hasOwnProperty(language)) {
        return res.status(400).send('Invalid language');
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: `Generate a prayer about ${topic} in ${languages[language]}` }],
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
        const uniqueId = uuidv4();
        const audioFilePath = `output-${uniqueId}.mp3`;
        const textFilePath = `prayer-${uniqueId}.txt`;

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

        res.json({ prayer, audioUrl, textUrl });

        // Cleanup: delete the local files
        fs.unlinkSync(audioFilePath);
        fs.unlinkSync(textFilePath);

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

        const prayers = response.Contents.reduce((acc, item) => {
            const key = item.Key;
            const url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
            if (key.endsWith('.mp3')) {
                acc.push({ audioUrl: url, textUrl: url.replace('.mp3', '.txt') });
            }
            return acc;
        }, []);

        res.json({ prayers });
    } catch (error) {
        console.error('Error listing prayers:', error);
        res.status(500).send('Error listing prayers');
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
