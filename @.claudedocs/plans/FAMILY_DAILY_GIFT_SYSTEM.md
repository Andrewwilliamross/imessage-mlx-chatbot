# Family Daily Gift System

## Overview

An extension to the iMessage MLX Chatbot that sends personalized daily messages to family members based on their individual interests. A thoughtful, AI-powered gift that delivers fresh, tailored content every morning.

**Status:** Planning
**Depends On:** Core iMessage MLX Chatbot (Phases 1-7)
**Target Launch:** After core system is stable
**Related:** [Feature Roadmap](./FAMILY_GIFT_FEATURE_ROADMAP.md) - Detailed phased implementation

---

## Dual-Model Architecture

This system uses a **dual-model approach** to optimize for both capability and cost:

| Message Type | Model | Provider | Capabilities | Cost |
|--------------|-------|----------|--------------|------|
| **Proactive Daily Messages** | Claude 3.5 Sonnet / GPT-4 | OpenRouter | Web search, image generation, tools | ~$0.02-0.10/msg |
| **Reply Handling** | Llama-3.2-3B-Instruct-4bit | Local MLX | Fast, private, conversational | Free |

### Why This Architecture?

**Proactive Messages (OpenRouter):**
- Rich content requiring real-time information (today's Nashville events, current Bible verse, trending recipes)
- AI image generation for visual gifts
- Tool access (web search) for dynamic, personalized content
- Only 5 messages/day (one per family member) = controlled costs

**Reply Handling (Local MLX):**
- Fast response times (~1-3 seconds)
- No API costs for ongoing conversations
- Privacy for family conversations
- Works offline if internet is down
- Maintains conversation context per family member

---

## Concept

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Family Daily Gift System                            │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Family Member Profiles                          │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │ │
│  │  │   Dad    │ │   Mom    │ │  Sister  │ │ Brother  │ │ Grandma  │ │ │
│  │  │  David   │ │          │ │   USC    │ │          │ │          │ │ │
│  │  │ 6:30 AM  │ │ 7:00 AM  │ │ 8:00 AM  │ │ 7:30 AM  │ │ 7:00 AM  │ │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │ │
│  └───────┼────────────┼────────────┼────────────┼────────────┼───────┘ │
│          │            │            │            │            │          │
│          ▼            ▼            ▼            ▼            ▼          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     Scheduler (node-schedule)                      │ │
│  │  • Cron-based timing per family member                            │ │
│  │  • Timezone aware                                                  │ │
│  │  • Day-of-week theme rotation                                     │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                 │                                        │
│                                 ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Content Generator                               │ │
│  │  • Personalized system prompts per person                         │ │
│  │  • Theme-based content templates                                  │ │
│  │  • Date/season awareness                                          │ │
│  │  • Holiday special content                                        │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                 │                                        │
│                                 ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      MLX API (/generate)                           │ │
│  │              Llama-3.2-3B-Instruct-4bit                           │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                 │                                        │
│                                 ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    MessageService (iMessage)                       │ │
│  │              Sends personalized message via AppleScript            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## OpenRouter Tool Integration

### Web Search Capability

The proactive daily messages leverage OpenRouter's tool-calling feature to enable real-time web search, making each message fresh and contextually relevant.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                    PROACTIVE MESSAGE GENERATION FLOW                          │
│                                                                               │
│  ┌─────────────┐     ┌───────────────────────────────────────────────────┐   │
│  │  Scheduler  │────▶│              OpenRouter API                       │   │
│  │  triggers   │     │                                                   │   │
│  │  at 6:30 AM │     │  ┌─────────────────────────────────────────────┐ │   │
│  └─────────────┘     │  │  Claude 3.5 Sonnet (with tools)             │ │   │
│                      │  │                                              │ │   │
│                      │  │  Available Tools:                           │ │   │
│                      │  │  ┌─────────────┐  ┌──────────────────────┐  │ │   │
│                      │  │  │ web_search  │  │ generate_image       │  │ │   │
│                      │  │  │             │  │                      │  │ │   │
│                      │  │  │ Query:      │  │ Prompt:              │  │ │   │
│                      │  │  │ "Nashville  │  │ "Serene sunrise      │  │ │   │
│                      │  │  │  events     │  │  over Tennessee      │  │ │   │
│                      │  │  │  today"     │  │  mountains..."       │  │ │   │
│                      │  │  └──────┬──────┘  └──────────┬───────────┘  │ │   │
│                      │  │         │                    │              │ │   │
│                      │  └─────────┼────────────────────┼──────────────┘ │   │
│                      │            │                    │                │   │
│                      └────────────┼────────────────────┼────────────────┘   │
│                                   │                    │                     │
│                                   ▼                    ▼                     │
│                      ┌────────────────────┐  ┌────────────────────────┐     │
│                      │  Exa / Tavily API  │  │  Flux / DALL-E API     │     │
│                      │  (Web Search)      │  │  (Image Generation)    │     │
│                      └─────────┬──────────┘  └───────────┬────────────┘     │
│                                │                         │                   │
│                                └────────────┬────────────┘                   │
│                                             │                                │
│                                             ▼                                │
│                      ┌───────────────────────────────────────────────────┐  │
│                      │              Final Generated Content              │  │
│                      │  • Personalized text with real-time info          │  │
│                      │  • AI-generated image (optional)                  │  │
│                      │  • Enriched with web search results               │  │
│                      └───────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Tool Definitions

```typescript
// Web Search Tool - enables real-time information retrieval
const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for current information. Use for: events, news, recipes, venues, Bible verses, historical facts.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        },
        category: {
          type: 'string',
          enum: ['news', 'events', 'recipes', 'venues', 'general', 'religious'],
          description: 'Category to help refine results'
        },
        location: {
          type: 'string',
          description: 'Location to localize results (e.g., "Nashville, TN")'
        }
      },
      required: ['query']
    }
  }
};
```

### Web Search Use Cases by Family Member

| Member | Theme | Web Search Query Examples |
|--------|-------|---------------------------|
| **Dad** | Devotional | "Bible verse about strength {date}", "daily devotional reading" |
| **Dad** | Nashville History | "Nashville history this day {month} {day}", "Grand Ole Opry history" |
| **Dad** | Recipes | "Southern comfort food recipe {season}", "easy weeknight dinner" |
| **Mom** | Music Venues | "Nashville live music tonight", "best listening rooms Nashville" |
| **Mom** | Design | "interior design trends 2025", "cozy home styling tips" |
| **Sister** | Travel | "bucket list destinations 2025", "affordable travel tips" |
| **Sister** | Wellness | "morning wellness routine", "healthy quick breakfast" |
| **Brother** | Architecture | "famous modern architecture", "Tadao Ando buildings" |
| **Brother** | Fashion | "street fashion trends winter 2025", "workwear styling" |
| **Grandma** | Gardening | "December garden tasks {region}", "winter garden planning" |
| **Grandma** | Antiques | "antique valuables to look for", "vintage kitchen collectibles" |

### Web Search Provider Configuration

```bash
# .env configuration
WEB_SEARCH_PROVIDER=exa          # Options: exa, tavily, serp
WEB_SEARCH_API_KEY=your-api-key

# Provider comparison:
# - Exa: Best semantic search, good for contextual queries ($0.001/search)
# - Tavily: Fast, includes AI summaries ($0.01/search)
# - SerpAPI: Google results, reliable ($0.001/search)
```

---

## Family Member Profiles

### Dad (David)

**Interests:** Christianity/Faith, Nashville TN History, Food/Recipes
**Send Time:** 6:30 AM CT (early riser, with coffee)
**Tone:** Warm, encouraging, reverent when spiritual

| Day | Theme | Description |
|-----|-------|-------------|
| Monday | Morning Devotional | Scripture verse + brief reflection |
| Tuesday | Nashville History | "On this day" or landmark story |
| Wednesday | Recipe of the Day | Southern comfort food, easy weeknight |
| Thursday | Encouragement + Psalm | Uplifting verse for end of week push |
| Friday | Weekend Recipe | Something to cook Saturday/Sunday |
| Saturday | Nashville Landmark | Deep dive on Ryman, Grand Ole Opry, etc. |
| Sunday | Sermon Reflection | Thoughtful question or passage |

**Sample System Prompt:**
```
You are sending a warm, personalized morning message to David, a Christian man
who loves his faith, Nashville history, and good food. Keep messages concise
(2-4 sentences for devotionals, slightly longer for recipes/history).
Be genuine, not preachy. When sharing scripture, include the reference.
For recipes, give brief instructions that fit in a text message.
Sign off warmly but not formally.
```

**Sample Outputs:**

*Monday - Devotional:*
> Good morning David! Here's a verse to carry with you today:
>
> *"Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go."* — Joshua 1:9
>
> Whatever this week brings, you're not walking it alone. Have a blessed day.

*Tuesday - Nashville History:*
> Morning Dad! Nashville history for your Tuesday:
>
> The Parthenon in Centennial Park was built in 1897 as a temporary exhibit for Tennessee's Centennial Exposition. It was so beloved that the city rebuilt it permanently in the 1920s — making Nashville the only city with a full-scale replica of the Greek original. The 42-foot Athena statue inside is the largest indoor sculpture in the Western world.
>
> Pretty cool backyard, huh?

*Wednesday - Recipe:*
> Hey Dad, easy weeknight recipe:
>
> **Skillet Pork Chops with Apples**
> Season 4 bone-in chops with salt, pepper, and sage. Sear 4 min per side in cast iron. Remove. Add 2 sliced apples and 1 diced onion to the pan. Cook 5 min. Add ½ cup apple cider, return chops, cover and simmer 10 min.
>
> Tastes like fall. Enjoy!

*Friday - Weekend Recipe:*
> Weekend cooking idea for you:
>
> **Slow Cooker Nashville-Style Pulled Pork**
> Rub a 4 lb pork shoulder with brown sugar, paprika, garlic powder, cayenne, salt. Place in slow cooker with ½ cup apple cider vinegar and ¼ cup mustard. Low 8-10 hours. Shred and mix with juices. Pile on buns with slaw.
>
> Perfect for Saturday football. Let me know how it turns out!

---

### Mom

**Interests:** Nashville TN, Interior Design, Live Music/Bars
**Send Time:** 7:00 AM CT
**Tone:** Stylish, warm, encouraging creativity

| Day | Theme | Description |
|-----|-------|-------------|
| Monday | Design Tip | Color, texture, arrangement wisdom |
| Tuesday | Nashville Music Pick | Who's playing, venue recommendations |
| Wednesday | Room Styling Idea | Seasonal refresh, arrangement tips |
| Thursday | Hidden Gem Venue | Bar, listening room, discovery |
| Friday | Weekend Design Inspo | Project idea or Pinterest-worthy tip |
| Saturday | Nashville Event | What's happening around town |
| Sunday | Cozy Home Moment | Relax, reset, self-care at home |

**Sample System Prompt:**
```
You are sending a stylish, warm morning message to a woman who loves interior
design, Nashville's live music scene, and discovering great bars and venues.
Keep messages inspiring and actionable. For design tips, be specific and visual.
For music/venues, share genuine recommendations with personality.
Tone is warm, sophisticated, but not stuffy. End with encouragement.
```

**Sample Outputs:**

*Monday - Design Tip:*
> Good morning! Design tip to start your week:
>
> **Layer your lighting.** Every room needs three types: ambient (overhead), task (reading lamps), and accent (candles, under-cabinet). Right now, try adding one table lamp to a corner that feels flat. It instantly adds warmth and dimension.
>
> Happy Monday — go make something beautiful! ✨

*Thursday - Hidden Gem:*
> Happy Thursday! Hidden gem for your radar:
>
> **The Basement East** — Not-so-hidden, but their smaller room (The Fenix) hosts incredible under-the-radar shows. Intimate, great sound, and you'll catch artists before they blow up. Check their calendar for songwriter nights.
>
> Perfect excuse for a midweek date night!

*Sunday - Cozy Home:*
> Sunday reset idea:
>
> Create a "slow morning corner" — a chair angled toward natural light, a small table for coffee, a plant within view. No phone for the first 30 minutes there. Light a candle. Let the house be quiet.
>
> You spend so much energy making home beautiful for others. Enjoy it yourself today. 💫

---

### Sister (USC Business Student)

**Interests:** Travel, Health Foods, Fitness/Wellness, Painting, Media/Advertising
**Send Time:** 8:00 AM PT (before classes, LA time)
**Tone:** Empowering, energetic, big-sister-hype-energy, gen-z aware but not cringe

| Day | Theme | Description |
|-----|-------|-------------|
| Monday | Badass Motivation | Hype her up for the week |
| Tuesday | Quick Healthy Recipe | Easy, dorm/apartment friendly |
| Wednesday | Travel Bucket List | Dream destination inspiration |
| Thursday | Ad/Media Insight | Industry wisdom, career inspiration |
| Friday | Weekend Workout | Quick fitness idea |
| Saturday | Creative Painting Prompt | Art inspiration |
| Sunday | Self-Care Wellness | Recharge for the week ahead |

**Sample System Prompt:**
```
You are sending an empowering, energetic morning message to a young woman
studying business at USC. She's ambitious, creative, health-conscious, and
loves travel and art. Tone is like a supportive older sibling — hype her up
without being cheesy. Be real, be encouraging, be specific. She's smart,
so don't dumb things down. Reference her juggling multiple passions as a
strength. Keep it punchy and authentic.
```

**Sample Outputs:**

*Monday - Motivation:*
> Good morning 👑
>
> Quick reminder: You're building a business degree at a top school while maintaining your health, chasing creativity, and dreaming about the world. Most people can barely commit to one thing.
>
> You're not most people. Go own this week.

*Wednesday - Travel:*
> Midweek wanderlust:
>
> **Lisbon, Portugal** — Pastel buildings climbing hillsides, €3 wine, world-class street art, and pastéis de nata (custard tarts) that'll ruin all other desserts for you. Affordable, beautiful, and not overrun yet.
>
> Add it to the list. You'll get there. 🌍

*Thursday - Ad Insight:*
> Industry wisdom for your Thursday:
>
> The best ads don't sell products — they sell identity. Nike doesn't sell shoes; they sell "you're an athlete." Apple doesn't sell computers; they sell "you're a creative."
>
> Every campaign you study, ask: *what transformation are they promising?*
>
> You're learning to tell stories that move people. That's powerful. 💡

*Saturday - Painting Prompt:*
> Creative prompt for the weekend:
>
> **Paint what 3 AM feels like.**
>
> Not what it looks like — what it *feels* like. Is it quiet? Anxious? Peaceful? Electric? Let color and texture do the talking. No rules. Just brush to canvas.
>
> Send me a pic if you make something. 🎨

---

### Brother

**Interests:** Architecture, History, Street Fashion, Cigars, Art
**Send Time:** 7:30 AM CT
**Tone:** Cool, cultured, understated, respects intelligence

| Day | Theme | Description |
|-----|-------|-------------|
| Monday | Architecture Spotlight | Famous building or architect |
| Tuesday | Street Fashion Intel | Trends, drops, style notes |
| Wednesday | Historical Moment | Interesting "on this day" or era |
| Thursday | Cigar & Culture | Ritual, pairings, history |
| Friday | Art Movement/Artist | Gallery-worthy knowledge |
| Saturday | Weekend Look | Styling idea or brand spotlight |
| Sunday | Design Philosophy | Architect wisdom, quotes |

**Sample System Prompt:**
```
You are sending a cultured, understated morning message to a young man with
refined taste in architecture, fashion, history, cigars, and art. He's not
flashy — he appreciates substance, craftsmanship, and things with stories
behind them. Keep messages intelligent but not pretentious. Tone is like
a knowledgeable friend sharing something cool, not a lecture.
Be specific, be interesting, skip the fluff.
```

**Sample Outputs:**

*Monday - Architecture:*
> Morning. Building worth knowing:
>
> **Tadao Ando's Church of the Light (1989)** — Osaka, Japan. Concrete box, one cruciform slit in the wall. No glass. Sunlight becomes the cross. Ando said "light only exists in relation to darkness." The simplest materials, the most profound effect.
>
> Worth seeing in person someday.

*Tuesday - Fashion:*
> Streetwear note:
>
> Workwear is eating. Carhartt WIP, Dickies 874s, and double-knee pants are everywhere — but the move is pairing them with cleaner pieces. Work jacket over a mock neck. Utility meets refinement.
>
> The look says "I could build something or close a deal." Versatility is the flex.

*Thursday - Cigar:*
> Cigar thought:
>
> Winston Churchill smoked 8-10 cigars a day and had a size named after him (7" x 47 ring). He called his cigar time "my hour of meditation." No phone equivalent back then — just smoke, silence, and thought.
>
> Consider it: one cigar, one notebook, no screens. Architects and writers have done this for centuries. Some of the best ideas live in that space.

*Friday - Art:*
> Artist to know:
>
> **James Turrell** — He doesn't paint light; he sculpts it. His Skyspaces are architectural apertures framing the actual sky as art. "I want to create an experience of wordless thought."
>
> If you're ever near one of his installations (there's one in Houston), go at sunrise or sunset. It's transcendent.

---

### Grandma

**Interests:** Baking, Gardening, Antiques
**Send Time:** 7:00 AM CT
**Tone:** Warm, loving, appreciative, gentle

| Day | Theme | Description |
|-----|-------|-------------|
| Monday | Baking Tip | Helpful kitchen wisdom |
| Tuesday | Garden Seasonal | What to do/enjoy this time of year |
| Wednesday | Antique Spotlight | History of a collectible |
| Thursday | Classic Recipe | Nostalgic, traditional |
| Friday | Weekend Garden Plan | What to prep or enjoy |
| Saturday | Antique Hunting Tip | What to look for, where to find |
| Sunday | Sweet Note | Just love and appreciation |

**Sample System Prompt:**
```
You are sending a warm, loving morning message to a grandmother who loves
baking, gardening, and antiques. She is the heart of the family and has
passed down traditions through her recipes and care. Tone is gentle,
appreciative, and genuinely warm — like a grandchild who recognizes how
special she is. For tips, be practical and specific. For antiques, share
interesting history. Always end with warmth.
```

**Sample Outputs:**

*Monday - Baking Tip:*
> Good morning! Baking tip to start your week:
>
> **Chill your pie dough.** After mixing, flatten into a disk, wrap in plastic, and refrigerate at least 1 hour (overnight is even better). Cold butter = flaky crust. Warm butter = tough crust.
>
> Patience is the secret ingredient. 🥧 Have a wonderful day!

*Wednesday - Antique:*
> Antique spotlight:
>
> **Hoosier Cabinets** — Those kitchen workstations from the early 1900s with the flour sifter built in. They were the "kitchen island" of their day, designed to save steps for busy homemakers. Original ones with the accessories intact are treasures now.
>
> If you see one at an estate sale with the original hardware, that's the find!

*Friday - Garden:*
> Weekend garden thought:
>
> December is perfect for planning. Flip through seed catalogs, sketch where things might go, dream about spring colors. The best gardens start in the imagination during winter months.
>
> What are you thinking about planting this year? 🌷

*Sunday - Sweet Note:*
> Sunday morning note just for you:
>
> You're the reason we all love gathering in the kitchen. Every recipe you've shared, every pie you've baked, every tomato you've grown — it all carries love into the next generation.
>
> Thank you for being the heart of this family. We love you. 💛

---

## Technical Implementation

### File Structure Addition

```
src/
├── gift-system/
│   ├── GiftScheduler.ts        # Main scheduler orchestration
│   ├── FamilyProfiles.ts       # Profile definitions
│   ├── ContentGenerator.ts     # Theme-based prompt construction
│   ├── templates/
│   │   ├── dad.ts              # David's themes and prompts
│   │   ├── mom.ts              # Mom's themes and prompts
│   │   ├── sister.ts           # Sister's themes and prompts
│   │   ├── brother.ts          # Brother's themes and prompts
│   │   └── grandma.ts          # Grandma's themes and prompts
│   ├── types.ts                # Type definitions
│   └── index.ts                # Module exports
├── gift-main.ts                # Entry point for gift system
```

### Configuration

**File: `.env` additions**
```bash
# Family Daily Gift System
GIFT_SYSTEM_ENABLED=true
GIFT_TIMEZONE=America/Chicago

# Family Members (JSON or separate env vars)
FAMILY_DAD_PHONE=+1XXXXXXXXXX
FAMILY_DAD_NAME=David
FAMILY_DAD_SEND_TIME=06:30

FAMILY_MOM_PHONE=+1XXXXXXXXXX
FAMILY_MOM_NAME=Mom
FAMILY_MOM_SEND_TIME=07:00

FAMILY_SISTER_PHONE=+1XXXXXXXXXX
FAMILY_SISTER_NAME=Sister
FAMILY_SISTER_SEND_TIME=08:00
FAMILY_SISTER_TIMEZONE=America/Los_Angeles

FAMILY_BROTHER_PHONE=+1XXXXXXXXXX
FAMILY_BROTHER_NAME=Brother
FAMILY_BROTHER_SEND_TIME=07:30

FAMILY_GRANDMA_PHONE=+1XXXXXXXXXX
FAMILY_GRANDMA_NAME=Grandma
FAMILY_GRANDMA_SEND_TIME=07:00
```

### Core Types

```typescript
interface FamilyMember {
  id: string;
  name: string;
  phone: string;
  sendTime: string;          // "06:30" format
  timezone: string;          // "America/Chicago"
  interests: string[];
  themes: WeeklyTheme[];
  systemPrompt: string;
  enabled: boolean;
}

interface WeeklyTheme {
  dayOfWeek: number;         // 0=Sunday, 1=Monday, etc.
  themeName: string;
  promptTemplate: string;
  examples?: string[];
}

interface ScheduledMessage {
  familyMemberId: string;
  scheduledTime: Date;
  theme: string;
  content: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
}
```

### Scheduler Logic

```typescript
// GiftScheduler.ts - Pseudocode
class GiftScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();

  async initialize(familyMembers: FamilyMember[]): Promise<void> {
    for (const member of familyMembers) {
      if (!member.enabled) continue;

      // Parse send time
      const [hour, minute] = member.sendTime.split(':').map(Number);

      // Create cron schedule (runs daily)
      const cronExpression = `${minute} ${hour} * * *`;

      const job = schedule.scheduleJob(
        { rule: cronExpression, tz: member.timezone },
        () => this.sendDailyMessage(member)
      );

      this.jobs.set(member.id, job);
      logger.info(`Scheduled daily message for ${member.name} at ${member.sendTime} ${member.timezone}`);
    }
  }

  async sendDailyMessage(member: FamilyMember): Promise<void> {
    const today = new Date();
    const dayOfWeek = today.getDay();

    // Get today's theme
    const theme = member.themes.find(t => t.dayOfWeek === dayOfWeek);
    if (!theme) {
      logger.warn(`No theme for ${member.name} on day ${dayOfWeek}`);
      return;
    }

    // Build prompt
    const prompt = this.buildPrompt(member, theme, today);

    // Generate content
    const content = await this.mlxClient.generate({
      messages: [
        { role: 'system', content: member.systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.8
    });

    // Send message
    await this.messageService.sendMessage(member.phone, content.response);

    logger.info(`Sent ${theme.themeName} message to ${member.name}`);
  }

  private buildPrompt(member: FamilyMember, theme: WeeklyTheme, date: Date): string {
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    return theme.promptTemplate
      .replace('{date}', dateStr)
      .replace('{name}', member.name)
      .replace('{season}', this.getSeason(date))
      .replace('{dayOfWeek}', date.toLocaleDateString('en-US', { weekday: 'long' }));
  }
}
```

### PM2 Configuration Addition

```javascript
// ecosystem.config.cjs - add to apps array
{
  name: 'family-gift',
  script: 'dist/gift-main.js',
  cwd: __dirname,
  env: {
    NODE_ENV: 'production',
    GIFT_SYSTEM_ENABLED: 'true',
  },
  // Start after core services
  depends_on: ['mlx-api', 'imessage-chatbot'],
  // Restart settings
  autorestart: true,
  cron_restart: '0 4 * * *',  // Restart daily at 4 AM to refresh
  // Logging
  error_file: path.join(__dirname, 'logs', 'family-gift-error.log'),
  out_file: path.join(__dirname, 'logs', 'family-gift-out.log'),
}
```

---

## Special Occasions

### Holiday Overrides

The system detects holidays and sends special themed content:

| Holiday | Special Content |
|---------|-----------------|
| Christmas | Personalized Christmas blessing/wish |
| Easter | Resurrection message for Dad, spring themes for others |
| Thanksgiving | Gratitude-focused messages all around |
| Birthdays | Personal birthday message (requires birthday config) |
| Mother's Day | Special messages for Mom and Grandma |
| Father's Day | Special message for Dad |

### Birthday Configuration

```typescript
interface BirthdayConfig {
  familyMemberId: string;
  date: string;  // "MM-DD" format
  specialPrompt: string;
}

const birthdays: BirthdayConfig[] = [
  { familyMemberId: 'dad', date: '03-15', specialPrompt: 'Write a warm birthday message...' },
  // ... etc
];
```

---

## Monitoring & Logging

### Daily Summary Log

Each day, log a summary:

```
[2025-12-25 09:00:00] Daily Gift Summary:
  ✓ David (6:30 AM) - Sunday Devotional sent
  ✓ Mom (7:00 AM) - Cozy Home Moment sent
  ✓ Brother (7:30 AM) - Design Philosophy sent
  ✓ Grandma (7:00 AM) - Sweet Note sent
  ✓ Sister (8:00 AM PT) - Self-Care Wellness sent

  Total: 5 sent, 0 failed
```

### Failure Handling

If a message fails to send:
1. Retry up to 3 times with exponential backoff
2. Log the failure
3. Optionally notify you via separate iMessage
4. Continue with other family members

---

## Testing Plan

### Phase 1: Single Recipient Test
1. Configure only yourself as recipient
2. Run for 7 days to verify all themes work
3. Check content quality and variety

### Phase 2: Gradual Rollout
1. Add one family member at a time
2. Monitor for issues
3. Gather feedback (do they like it?)

### Phase 3: Full Deployment
1. All family members enabled
2. Monitor daily summary logs
3. Adjust prompts based on feedback

---

## AI Image Generation

### Overview

Enhance daily messages with personalized AI-generated images. The local MLX model crafts creative prompts tailored to each family member's interests, then OpenRouter generates the image, which is saved to Photos and sent via iMessage.

### Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Image Generation Pipeline                              │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 1: Local MLX Model Creates Image Prompt                           │ │
│  │                                                                          │ │
│  │  Input: Family member profile + today's theme + preferences             │ │
│  │  Output: Detailed image generation prompt                                │ │
│  │                                                                          │ │
│  │  Example for Brother (Architecture day):                                │ │
│  │  "A dramatic black and white photograph of Tadao Ando's Church of      │ │
│  │   the Light, concrete walls with cruciform window, divine light         │ │
│  │   streaming through, minimalist Japanese architecture, morning sun"     │ │
│  └────────────────────────────────┬────────────────────────────────────────┘ │
│                                   │                                           │
│                                   ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 2: OpenRouter API (Image Generation)                              │ │
│  │                                                                          │ │
│  │  POST https://openrouter.ai/api/v1/images/generations                   │ │
│  │  Models: black-forest-labs/flux-1.1-pro, stability/sdxl, dall-e-3      │ │
│  │  Returns: Image URL or base64 data                                      │ │
│  └────────────────────────────────┬────────────────────────────────────────┘ │
│                                   │                                           │
│                                   ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 3: Download & Save Image                                          │ │
│  │                                                                          │ │
│  │  Location: ~/Pictures/FamilyGifts/{member}/{date}-{theme}.png           │ │
│  │  Metadata: Store prompt, model used, timestamp                          │ │
│  └────────────────────────────────┬────────────────────────────────────────┘ │
│                                   │                                           │
│                                   ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 4: Add to Photos Library (AppleScript)                            │ │
│  │                                                                          │ │
│  │  tell application "Photos"                                               │ │
│  │      import POSIX file imagePath to album "Family Gifts"                │ │
│  │  end tell                                                                │ │
│  └────────────────────────────────┬────────────────────────────────────────┘ │
│                                   │                                           │
│                                   ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Step 5: Send via iMessage with Text                                    │ │
│  │                                                                          │ │
│  │  MessageService.sendMediaMessage(phone, text, imagePath)                │ │
│  │  Combines personalized text + generated image                           │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Configuration

**File: `.env` additions**
```bash
# OpenRouter Image Generation
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx
OPENROUTER_IMAGE_MODEL=black-forest-labs/flux-1.1-pro
# Alternative models:
# - stability/sdxl (faster, good quality)
# - openai/dall-e-3 (high quality, more expensive)
# - black-forest-labs/flux-schnell (fastest, free tier)

# Image Settings
IMAGE_GENERATION_ENABLED=true
IMAGE_SAVE_PATH=~/Pictures/FamilyGifts
IMAGE_SIZE=1024x1024
IMAGE_QUALITY=standard  # standard or hd

# Photos Library Integration
PHOTOS_ALBUM_NAME=Family Gifts
PHOTOS_INTEGRATION_ENABLED=true
```

### Image Theme Ideas Per Family Member

#### Dad (David)
| Day | Image Theme |
|-----|-------------|
| Monday | Serene sunrise over mountains with scripture overlay aesthetic |
| Tuesday | Historic Nashville landmark (Ryman, Parthenon, Union Station) |
| Wednesday | Rustic Southern food photography style |
| Thursday | Peaceful pastoral scene with warm light |
| Friday | Cozy kitchen scene with comfort food vibes |
| Saturday | Nashville skyline or historic district |
| Sunday | Stained glass window light, church interior ambiance |

**Sample Prompt Generation:**
```
System: You are creating an image generation prompt for David, who loves
Christianity, Nashville history, and Southern cooking. Today is Monday
(devotional day). Create a vivid, detailed prompt for an AI image generator.
The image should feel warm, uplifting, and spiritually meaningful.

Output: "A serene mountain landscape at golden hour sunrise, soft warm light
breaking through clouds creating god rays, a peaceful valley below with a
small chapel, impressionist painting style, hopeful and tranquil mood,
Tennessee rolling hills aesthetic"
```

#### Mom
| Day | Image Theme |
|-----|-------------|
| Monday | Beautiful interior design vignette |
| Tuesday | Atmospheric Nashville music venue |
| Wednesday | Styled bookshelf or cozy corner |
| Thursday | Intimate bar with warm lighting |
| Friday | Inspiring living space transformation |
| Saturday | Broadway neon lights or Ryman exterior |
| Sunday | Hygge home moment, morning light through windows |

**Sample Prompt Generation:**
```
System: You are creating an image generation prompt for a woman who loves
interior design, Nashville music venues, and cozy home aesthetics. Today is
Monday (design tip day). Create an aspirational, Pinterest-worthy image prompt.

Output: "A beautifully styled living room corner with layered lighting,
velvet accent chair in warm terracotta, brass floor lamp, fiddle leaf fig,
curated bookshelf with art objects, late afternoon golden light streaming
through linen curtains, editorial interior photography style"
```

#### Sister (USC)
| Day | Image Theme |
|-----|-------------|
| Monday | Empowering, bold aesthetic (city skyline, sunrise run) |
| Tuesday | Beautiful healthy food flat lay |
| Wednesday | Dream travel destination landscape |
| Thursday | Creative advertising/art direction inspired |
| Friday | Dynamic fitness/movement energy |
| Saturday | Abstract expressionist painting style |
| Sunday | Peaceful wellness scene (spa, meditation) |

**Sample Prompt Generation:**
```
System: You are creating an image for a driven young woman who loves travel,
fitness, painting, and advertising. Today is Saturday (painting day).
Create a prompt that inspires creativity and feels like modern art.

Output: "Abstract expressionist painting, bold confident brushstrokes,
vibrant magenta and electric blue with gold accents, energetic movement,
reminiscent of Helen Frankenthaler color field with Basquiat energy,
museum gallery quality, empowering feminine energy"
```

#### Brother
| Day | Image Theme |
|-----|-------------|
| Monday | Iconic architectural photography |
| Tuesday | Street style fashion editorial |
| Wednesday | Historic moment reimagined artistically |
| Thursday | Moody cigar lounge aesthetic |
| Friday | Fine art piece or art installation |
| Saturday | Urban fashion lookbook style |
| Sunday | Minimalist architectural detail |

**Sample Prompt Generation:**
```
System: You are creating an image for a cultured young man who appreciates
architecture, street fashion, cigars, and fine art. Today is Monday
(architecture day). Create a sophisticated, editorial-quality prompt.

Output: "Tadao Ando's Church of the Light in Osaka, dramatic black and white
architectural photography, cruciform light cutting through concrete darkness,
sharp contrast, sacred geometry, Hiroshi Sugimoto inspired composition,
contemplative minimalism"
```

#### Grandma
| Day | Image Theme |
|-----|-------------|
| Monday | Warm kitchen scene with fresh baked goods |
| Tuesday | Beautiful cottage garden in soft light |
| Wednesday | Vintage antique still life |
| Thursday | Nostalgic recipe ingredients arrangement |
| Friday | Peaceful garden path or potting bench |
| Saturday | Charming antique shop vignette |
| Sunday | Cozy grandmother's kitchen warmth |

**Sample Prompt Generation:**
```
System: You are creating an image for a grandmother who loves baking,
gardening, and antiques. Today is Monday (baking tip day). Create a warm,
nostalgic, comforting image prompt.

Output: "A warm farmhouse kitchen scene, freshly baked apple pie cooling on
a wooden counter, afternoon sunlight streaming through lace curtains,
vintage ceramic mixing bowls, flour dusted surface, copper pots hanging,
Norman Rockwell warmth meets modern food photography"
```

### Technical Implementation

#### File Structure Addition

```
src/
├── gift-system/
│   ├── image/
│   │   ├── ImageGenerator.ts       # Orchestrates the full pipeline
│   │   ├── OpenRouterClient.ts     # OpenRouter API integration
│   │   ├── PromptCrafter.ts        # MLX-based prompt generation
│   │   ├── PhotosLibrary.ts        # AppleScript Photos integration
│   │   ├── ImageStorage.ts         # Local file management
│   │   └── types.ts                # Image-related types
```

#### Core Types

```typescript
interface ImageGenerationConfig {
  enabled: boolean;
  openRouterApiKey: string;
  model: string;
  size: '1024x1024' | '1792x1024' | '1024x1792';
  quality: 'standard' | 'hd';
  savePath: string;
  photosAlbumName: string;
  photosIntegrationEnabled: boolean;
}

interface ImagePromptRequest {
  familyMember: FamilyMember;
  theme: WeeklyTheme;
  date: Date;
  additionalContext?: string;
}

interface GeneratedImage {
  localPath: string;
  prompt: string;
  model: string;
  timestamp: Date;
  familyMemberId: string;
  theme: string;
  openRouterResponse?: {
    id: string;
    created: number;
  };
}

interface ImageTheme {
  dayOfWeek: number;
  imageStyle: string;           // "architectural photography", "food styling", etc.
  promptGuidelines: string;     // Additional guidance for MLX prompt crafting
  negativePrompt?: string;      // What to avoid in the image
}
```

#### PromptCrafter (MLX-based)

```typescript
// PromptCrafter.ts
import { MLXClient } from '../../chatbot/MLXClient.js';

export class PromptCrafter {
  private mlxClient: MLXClient;

  constructor(mlxApiUrl: string) {
    this.mlxClient = new MLXClient(mlxApiUrl);
  }

  async craftImagePrompt(request: ImagePromptRequest): Promise<string> {
    const { familyMember, theme, date } = request;

    const systemPrompt = `You are an expert at crafting prompts for AI image generators
like DALL-E and Stable Diffusion. You create vivid, detailed prompts that result in
beautiful, meaningful images.

Today you are creating an image prompt for ${familyMember.name}.
Their interests: ${familyMember.interests.join(', ')}
Today's theme: ${theme.themeName}
Image style guidance: ${theme.imageStyle || 'high quality, professional'}

Create a single, detailed image generation prompt (2-3 sentences). Include:
- Subject and composition
- Lighting and mood
- Art style or photography style
- Color palette hints
- Emotional quality

Output ONLY the prompt, no explanations or prefixes.`;

    const userPrompt = `Create an image prompt for ${familyMember.name}'s
${theme.themeName} message on ${date.toLocaleDateString('en-US', { weekday: 'long' })}.`;

    const response = await this.mlxClient.generate({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 200,
      temperature: 0.9  // Higher for creative variation
    });

    return response.response.trim();
  }
}
```

#### OpenRouterClient

```typescript
// OpenRouterClient.ts
import fs from 'fs/promises';
import path from 'path';
import logger from '../../utils/logger.js';

interface OpenRouterImageRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
}

interface OpenRouterImageResponse {
  id: string;
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateImage(
    prompt: string,
    options: {
      model?: string;
      size?: string;
      quality?: string;
    } = {}
  ): Promise<OpenRouterImageResponse> {
    const {
      model = 'black-forest-labs/flux-1.1-pro',
      size = '1024x1024',
      quality = 'standard'
    } = options;

    logger.info('Generating image via OpenRouter', { model, prompt: prompt.substring(0, 50) });

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/your-app',  // Required by OpenRouter
        'X-Title': 'Family Gift System'
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size,
        quality
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as OpenRouterImageResponse;
    logger.info('Image generated successfully', { id: result.id });

    return result;
  }

  async downloadImage(url: string, savePath: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await fs.writeFile(savePath, Buffer.from(buffer));

    logger.info('Image saved', { path: savePath });
    return savePath;
  }

  async saveBase64Image(base64: string, savePath: string): Promise<string> {
    const buffer = Buffer.from(base64, 'base64');
    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await fs.writeFile(savePath, buffer);

    logger.info('Image saved from base64', { path: savePath });
    return savePath;
  }
}
```

#### PhotosLibrary (AppleScript Integration)

```typescript
// PhotosLibrary.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../../utils/logger.js';

const execAsync = promisify(exec);

export class PhotosLibrary {
  private albumName: string;

  constructor(albumName: string = 'Family Gifts') {
    this.albumName = albumName;
  }

  /**
   * Import an image into Photos app and add to the specified album
   */
  async importImage(imagePath: string): Promise<boolean> {
    // First, ensure the album exists
    await this.ensureAlbumExists();

    const script = `
      tell application "Photos"
        activate
        delay 1

        -- Import the image
        set theImage to import POSIX file "${imagePath}"

        -- Get the album
        set theAlbum to album "${this.albumName}"

        -- Add to album
        add theImage to theAlbum

        return "Success"
      end tell
    `;

    try {
      const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);

      if (stderr) {
        logger.warn('Photos import warning', { stderr });
      }

      logger.info('Image imported to Photos', {
        imagePath,
        album: this.albumName
      });

      return true;
    } catch (error) {
      logger.error('Failed to import image to Photos', { error, imagePath });
      return false;
    }
  }

  /**
   * Ensure the target album exists, create if not
   */
  private async ensureAlbumExists(): Promise<void> {
    const script = `
      tell application "Photos"
        if not (exists album "${this.albumName}") then
          make new album named "${this.albumName}"
        end if
      end tell
    `;

    try {
      await execAsync(`osascript -e '${script}'`);
      logger.debug('Album verified/created', { album: this.albumName });
    } catch (error) {
      logger.warn('Could not verify album exists', { error });
    }
  }

  /**
   * Get the most recently imported image from the album
   * Useful for verification
   */
  async getRecentImport(): Promise<string | null> {
    const script = `
      tell application "Photos"
        set theAlbum to album "${this.albumName}"
        set thePhotos to media items of theAlbum
        if (count of thePhotos) > 0 then
          set lastPhoto to item -1 of thePhotos
          return filename of lastPhoto
        else
          return "none"
        end if
      end tell
    `;

    try {
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      return stdout.trim() === 'none' ? null : stdout.trim();
    } catch (error) {
      logger.error('Failed to get recent import', { error });
      return null;
    }
  }
}
```

#### ImageGenerator (Orchestrator)

```typescript
// ImageGenerator.ts
import path from 'path';
import { PromptCrafter } from './PromptCrafter.js';
import { OpenRouterClient } from './OpenRouterClient.js';
import { PhotosLibrary } from './PhotosLibrary.js';
import { ImageGenerationConfig, ImagePromptRequest, GeneratedImage } from './types.js';
import logger from '../../utils/logger.js';

export class ImageGenerator {
  private promptCrafter: PromptCrafter;
  private openRouter: OpenRouterClient;
  private photosLibrary: PhotosLibrary;
  private config: ImageGenerationConfig;

  constructor(config: ImageGenerationConfig, mlxApiUrl: string) {
    this.config = config;
    this.promptCrafter = new PromptCrafter(mlxApiUrl);
    this.openRouter = new OpenRouterClient(config.openRouterApiKey);
    this.photosLibrary = new PhotosLibrary(config.photosAlbumName);
  }

  /**
   * Full pipeline: Generate prompt → Generate image → Save → Photos → Return path
   */
  async generateForFamilyMember(request: ImagePromptRequest): Promise<GeneratedImage | null> {
    if (!this.config.enabled) {
      logger.debug('Image generation disabled');
      return null;
    }

    const { familyMember, theme, date } = request;

    try {
      // Step 1: Craft the image prompt using local MLX
      logger.info('Crafting image prompt', {
        member: familyMember.name,
        theme: theme.themeName
      });

      const imagePrompt = await this.promptCrafter.craftImagePrompt(request);
      logger.info('Image prompt crafted', { prompt: imagePrompt.substring(0, 100) });

      // Step 2: Generate image via OpenRouter
      const imageResponse = await this.openRouter.generateImage(imagePrompt, {
        model: this.config.model,
        size: this.config.size,
        quality: this.config.quality
      });

      // Step 3: Download/save the image
      const dateStr = date.toISOString().split('T')[0];
      const filename = `${dateStr}-${theme.themeName.replace(/\s+/g, '-').toLowerCase()}.png`;
      const savePath = path.join(
        this.config.savePath.replace('~', process.env.HOME || ''),
        familyMember.id,
        filename
      );

      let localPath: string;
      const imageData = imageResponse.data[0];

      if (imageData.url) {
        localPath = await this.openRouter.downloadImage(imageData.url, savePath);
      } else if (imageData.b64_json) {
        localPath = await this.openRouter.saveBase64Image(imageData.b64_json, savePath);
      } else {
        throw new Error('No image data in response');
      }

      // Step 4: Import to Photos library
      if (this.config.photosIntegrationEnabled) {
        const imported = await this.photosLibrary.importImage(localPath);
        if (imported) {
          logger.info('Image added to Photos library', { album: this.config.photosAlbumName });
        }
      }

      // Return the result
      const result: GeneratedImage = {
        localPath,
        prompt: imagePrompt,
        model: this.config.model,
        timestamp: new Date(),
        familyMemberId: familyMember.id,
        theme: theme.themeName,
        openRouterResponse: {
          id: imageResponse.id,
          created: imageResponse.created
        }
      };

      logger.info('Image generation complete', {
        member: familyMember.name,
        path: localPath
      });

      return result;

    } catch (error) {
      logger.error('Image generation failed', {
        error,
        member: familyMember.name,
        theme: theme.themeName
      });
      return null;
    }
  }
}
```

### Updated GiftScheduler with Images

```typescript
// Updated sendDailyMessage in GiftScheduler.ts
async sendDailyMessage(member: FamilyMember): Promise<void> {
  const today = new Date();
  const dayOfWeek = today.getDay();

  // Get today's theme
  const theme = member.themes.find(t => t.dayOfWeek === dayOfWeek);
  if (!theme) {
    logger.warn(`No theme for ${member.name} on day ${dayOfWeek}`);
    return;
  }

  // Build text content prompt
  const textPrompt = this.buildPrompt(member, theme, today);

  // Generate text content
  const textContent = await this.mlxClient.generate({
    messages: [
      { role: 'system', content: member.systemPrompt },
      { role: 'user', content: textPrompt }
    ],
    max_tokens: 300,
    temperature: 0.8
  });

  // Generate image (if enabled and theme supports it)
  let imagePath: string | undefined;

  if (theme.includeImage !== false) {  // Default to true
    const generatedImage = await this.imageGenerator.generateForFamilyMember({
      familyMember: member,
      theme,
      date: today
    });

    if (generatedImage) {
      imagePath = generatedImage.localPath;
    }
  }

  // Send message (with or without image)
  if (imagePath) {
    await this.messageService.sendMediaMessage(
      member.phone,
      textContent.response,
      imagePath
    );
    logger.info(`Sent ${theme.themeName} message with image to ${member.name}`);
  } else {
    await this.messageService.sendMessage(member.phone, textContent.response);
    logger.info(`Sent ${theme.themeName} text-only message to ${member.name}`);
  }
}
```

### OpenRouter Model Options

| Model | Speed | Quality | Cost | Best For |
|-------|-------|---------|------|----------|
| `black-forest-labs/flux-schnell` | Fast | Good | Free tier | Testing, quick images |
| `black-forest-labs/flux-1.1-pro` | Medium | Excellent | $0.04/img | **Recommended** - great quality |
| `stability/sdxl` | Fast | Very Good | $0.002/img | Budget-friendly, good results |
| `openai/dall-e-3` | Medium | Excellent | $0.04-0.12/img | Best prompt understanding |

### Cost Estimation

| Family Size | Daily Images | Monthly Cost (Flux Pro) |
|-------------|--------------|-------------------------|
| 5 members | 5 images/day | ~$6/month |
| 5 members | 35 images/week (daily) | ~$6/month |
| 5 members | 10 images/week (2x each) | ~$1.60/month |

**Recommendation:** Start with `flux-schnell` (free) for testing, then upgrade to `flux-1.1-pro` for production quality.

### Environment Variables Addition

```bash
# Add to .env

# OpenRouter Configuration
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_IMAGE_MODEL=black-forest-labs/flux-1.1-pro

# Image Generation Settings
IMAGE_GENERATION_ENABLED=true
IMAGE_SAVE_PATH=~/Pictures/FamilyGifts
IMAGE_SIZE=1024x1024
IMAGE_QUALITY=standard

# Photos App Integration
PHOTOS_ALBUM_NAME=Family Gifts
PHOTOS_INTEGRATION_ENABLED=true

# Per-member image settings (optional overrides)
# Set to false to disable images for specific members
FAMILY_DAD_IMAGES_ENABLED=true
FAMILY_GRANDMA_IMAGES_ENABLED=true
```

### Sample Output: Complete Daily Gift

**Brother - Monday (Architecture Day)**

*Text Message:*
> Morning. Building worth knowing:
>
> **Tadao Ando's Church of the Light (1989)** — Osaka, Japan. Concrete box, one cruciform slit in the wall. No glass. Sunlight becomes the cross. Ando said "light only exists in relation to darkness."
>
> Worth seeing in person someday.

*Attached Image:*
> [AI-generated black and white architectural photo of Church of the Light,
> dramatic lighting through cruciform window, minimalist concrete interior]

**Grandma - Monday (Baking Day)**

*Text Message:*
> Good morning! Baking tip to start your week:
>
> **Chill your pie dough.** After mixing, flatten into a disk, wrap in plastic,
> and refrigerate at least 1 hour. Cold butter = flaky crust.
>
> Patience is the secret ingredient. Have a wonderful day!

*Attached Image:*
> [AI-generated warm farmhouse kitchen scene, golden pie cooling on counter,
> afternoon light through lace curtains, vintage baking aesthetic]

---

## Future Enhancements

1. **Reply Detection** — If family member replies, capture for context in future messages
2. **Feedback Loop** — "Did you like today's message? Reply 1-5"
3. **External Data** — Pull real Nashville events, real recipes from APIs
4. **Image Style Memory** — Learn which image styles each person likes best
5. **Voice Messages** — Generate audio versions using local TTS
6. **Family Group Updates** — Weekly digest to a family group chat
7. **Image Variations** — Generate 2-3 options, pick best or let them choose

---

## Privacy Considerations

- All processing happens locally on Mac Mini
- No data leaves the device
- Messages are personal and should remain within family
- Consider informing family members this is AI-assisted (or keep it as a delightful mystery)

---

*Document Version: 2.0 | December 24, 2025*
*A gift that keeps giving, powered by dual-model AI architecture*

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Dec 24, 2025 | Added dual-model architecture, OpenRouter tool integration, web search capability |
| 1.0 | Dec 24, 2025 | Initial document with family profiles and image generation |
