// First batch from research/first-batch.md (2026-10-27). Everything here is UNVERIFIED:
// it comes from secondary roundup articles, and a moderator must check each offer against
// the official terms (and replace search links with the real terms page) before verifying it.
import type { BrandKind, Category, Window } from "../src/db/schema";

export type SeedOffer = {
  brand: string;
  kind: BrandKind;
  category: Category;
  website?: string;
  osmName?: string; // value of the OSM `brand` tag used by the importer
  location?: { lat: number; lng: number; address: string };
  title: string;
  titleZh: string;
  details?: string;
  conditions: string;
  window: Window;
  windowNote?: string;
  membershipRequired: boolean;
  officialUrl: string;
};

const search = (q: string) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;

export const SEED_OFFERS: SeedOffer[] = [
  // ---- Food ----
  { brand: "Denny's", kind: "chain", category: "food", website: "https://www.dennys.ca", osmName: "Denny's",
    title: "Free Build Your Own Grand Slam", titleZh: "免費 Build Your Own Grand Slam 早餐",
    details: "Some locations don't participate (reportedly including Dundas St in Toronto).",
    conditions: "Show valid photo ID.", window: "day", membershipRequired: false, officialUrl: "https://www.dennys.ca" },
  { brand: "Harvey's", kind: "chain", category: "food", website: "https://www.harveys.ca", osmName: "Harvey's",
    title: "Free birthday treat (pie or burger)", titleZh: "生日免費點心（派或漢堡）",
    details: "Sources disagree: a free pie, or a free Original burger with a side or drink.",
    conditions: "Burger Boss Club / Harvey's app.", window: "day", membershipRequired: true, officialUrl: "https://www.harveys.ca" },
  { brand: "Boston Pizza", kind: "chain", category: "food", website: "https://bostonpizza.com", osmName: "Boston Pizza",
    title: "Free birthday dessert", titleZh: "生日免費甜點",
    conditions: "MyBP member. Reward loads 7 days before your birthday. Dine-in only.", window: "custom",
    windowNote: "Expires about 2 months after loading", membershipRequired: true, officialUrl: "https://bostonpizza.com" },
  { brand: "Red Robin", kind: "chain", category: "food", website: "https://www.redrobin.ca", osmName: "Red Robin",
    title: "Free birthday milkshake (or burger)", titleZh: "生日免費奶昔（或漢堡）",
    details: "Burger upgrade reportedly requires $10 spend during the year; one source says it's only in BC/AB.",
    conditions: "Red Robin Royalty member.", window: "month", membershipRequired: true, officialUrl: "https://www.redrobin.ca" },
  { brand: "Swiss Chalet", kind: "chain", category: "food", website: "https://www.swisschalet.com", osmName: "Swiss Chalet",
    title: "Birthday reward (quarter chicken dinner or dessert)", titleZh: "生日禮（1/4 雞套餐或甜點）",
    details: "Sources disagree on what the reward is.",
    conditions: "Member with at least one previous visit.", window: "month", membershipRequired: true, officialUrl: "https://www.swisschalet.com" },
  { brand: "Chipotle", kind: "chain", category: "food", website: "https://www.chipotle.ca", osmName: "Chipotle",
    title: "Free guac, queso, chips or a drink", titleZh: "免費酪梨醬、queso、玉米片或飲料（擇一）",
    conditions: "Chipotle Rewards member; add your birthday in the app.", window: "month", membershipRequired: true, officialUrl: "https://www.chipotle.ca" },
  { brand: "Tim Hortons", kind: "chain", category: "drink", website: "https://www.timhortons.ca", osmName: "Tim Hortons",
    title: "Free birthday drink + baked good", titleZh: "生日免費飲料加烘焙點心",
    details: "Some sources say a breakfast sandwich instead; one says there's no birthday reward.",
    conditions: "Tims Rewards; activate the offer in the app.", window: "day", membershipRequired: true, officialUrl: "https://www.timhortons.ca" },
  { brand: "Pizza Pizza", kind: "chain", category: "food", website: "https://www.pizzapizza.ca", osmName: "Pizza Pizza",
    title: "Kids: free slice and drink", titleZh: "兒童：免費一片披薩加飲料",
    conditions: "Kids 12 and under, Kids Club.", window: "custom", windowNote: "Kids only", membershipRequired: true, officialUrl: "https://www.pizzapizza.ca" },
  { brand: "COBS Bread", kind: "chain", category: "dessert", website: "https://www.cobsbread.com", osmName: "COBS Bread",
    title: "Free birthday treat (e.g. cinnamon bun)", titleZh: "生日免費點心（例如肉桂捲）",
    conditions: "COBS Club member.", window: "day", membershipRequired: true, officialUrl: "https://www.cobsbread.com" },
  { brand: "Impact Kitchen", kind: "chain", category: "food", website: "https://www.impactkitchen.com", osmName: "Impact Kitchen",
    title: "Free birthday smoothie", titleZh: "生日免費果昔",
    conditions: "Loyalty program member.", window: "day", membershipRequired: true, officialUrl: "https://www.impactkitchen.com" },
  { brand: "Kettlemans Bagel", kind: "chain", category: "food", osmName: "Kettlemans Bagel",
    title: "Free bagels (reported: a dozen)", titleZh: "免費貝果（有人回報一打）",
    details: "Only user-reported so far.", conditions: "App member.", window: "day", membershipRequired: true,
    officialUrl: search("Kettlemans Bagel birthday app reward") },

  // ---- Drinks ----
  { brand: "Starbucks", kind: "chain", category: "drink", website: "https://www.starbucks.ca", osmName: "Starbucks",
    title: "Free birthday drink or treat", titleZh: "生日免費飲料或點心",
    conditions: "Starbucks Rewards member with birthday on file.", window: "day", membershipRequired: true, officialUrl: "https://www.starbucks.ca/rewards" },
  { brand: "Chatime", kind: "chain", category: "drink", osmName: "Chatime",
    title: "Free regular-size drink", titleZh: "免費一杯中杯飲料",
    conditions: "Chatime app member; spend about $2.50 in the months before your birthday.", window: "custom",
    windowNote: "7 days before to 7 days after", membershipRequired: true, officialUrl: search("Chatime Canada birthday reward app") },
  { brand: "Gong Cha", kind: "chain", category: "drink", osmName: "Gong Cha",
    title: "Free bubble tea", titleZh: "免費一杯珍奶",
    conditions: "Rewards program member.", window: "day", membershipRequired: true, officialUrl: search("Gong Cha Canada birthday reward") },
  { brand: "Booster Juice", kind: "chain", category: "drink", website: "https://www.boosterjuice.com", osmName: "Booster Juice",
    title: "Free regular smoothie", titleZh: "免費一杯中杯果昔",
    conditions: "Loyalty member.", window: "week", windowNote: "About 7 days", membershipRequired: true, officialUrl: "https://www.boosterjuice.com" },
  { brand: "Good Earth Coffeehouse", kind: "chain", category: "drink", website: "https://www.goodearthcoffeehouse.com", osmName: "Good Earth Coffeehouse",
    title: "Free drink or bakery item", titleZh: "免費飲料或烘焙點心",
    conditions: "Loyalty member.", window: "week", windowNote: "About 7 days", membershipRequired: true, officialUrl: "https://www.goodearthcoffeehouse.com" },
  { brand: "DAVIDsTEA", kind: "online", category: "drink", website: "https://www.davidstea.com",
    title: "Birthday points (reported: 5 points or a tin)", titleZh: "生日點數（有人回報 5 點或一罐茶）",
    details: "All retail stores have closed; online only.", conditions: "Frequent Steeper member.", window: "month",
    membershipRequired: true, officialUrl: "https://www.davidstea.com" },

  // ---- Dessert ----
  { brand: "Baskin-Robbins", kind: "chain", category: "dessert", website: "https://www.baskinrobbins.ca", osmName: "Baskin-Robbins",
    title: "BOGO cone (or free scoop) + $3 off a cake", titleZh: "甜筒買一送一（或免費一球），蛋糕折 $3",
    details: "Sources disagree on BOGO vs a free scoop.", conditions: "Club 31 member.", window: "day", membershipRequired: true,
    officialUrl: "https://www.baskinrobbins.ca" },
  { brand: "Hotel Gelato", kind: "chain", category: "dessert", osmName: "Hotel Gelato",
    title: "Free gelato", titleZh: "免費一份 gelato",
    conditions: "Newsletter subscriber.", window: "day", membershipRequired: true, officialUrl: search("Hotel Gelato Toronto birthday newsletter") },
  { brand: "MILK (Queen St W)", kind: "local", category: "dessert",
    title: "Free soft serve cone", titleZh: "免費霜淇淋甜筒",
    conditions: "Walk in and show ID.", window: "day", membershipRequired: false, officialUrl: search("MILK soft serve Queen Street West Toronto birthday") },
  { brand: "Menchie's", kind: "chain", category: "dessert", website: "https://www.menchies.ca", osmName: "Menchie's",
    title: "Free frozen yogurt", titleZh: "免費優格",
    details: "No recent source found; needs checking.", conditions: "MyMenchie's member.", window: "day", membershipRequired: true,
    officialUrl: "https://www.menchies.ca" },

  // ---- Beauty & shopping ----
  { brand: "Sephora", kind: "chain", category: "beauty", website: "https://www.sephora.com/ca/en", osmName: "Sephora",
    title: "Free birthday gift set", titleZh: "免費生日禮盒",
    conditions: "Beauty Insider (free). Free in store; online needs a $25 purchase.", window: "month", membershipRequired: true,
    officialUrl: "https://www.sephora.com/ca/en/beauty/loyalty-program" },
  { brand: "The Body Shop", kind: "chain", category: "beauty", osmName: "The Body Shop",
    title: "$10 birthday voucher", titleZh: "$10 生日折價券",
    details: "Many Canadian stores closed in 2024.", conditions: "Minimum $15 purchase.", window: "custom", windowNote: "30 days",
    membershipRequired: true, officialUrl: search("The Body Shop Canada birthday voucher") },
  { brand: "Bath & Body Works", kind: "chain", category: "beauty", osmName: "Bath & Body Works",
    title: "Free item (up to $9.95)", titleZh: "免費商品（原價 $9.95 以下）",
    details: "Some sources say a purchase is required.", conditions: "Rewards member.", window: "custom", windowNote: "30 days",
    membershipRequired: true, officialUrl: search("Bath & Body Works Canada birthday reward") },
  { brand: "Aveda", kind: "chain", category: "beauty", website: "https://www.aveda.ca", osmName: "Aveda",
    title: "Free composition oil with purchase", titleZh: "消費即送香氛精油",
    conditions: "Member; purchase required.", window: "day", membershipRequired: true, officialUrl: "https://www.aveda.ca" },
  { brand: "Kiehl's", kind: "chain", category: "beauty", website: "https://www.kiehls.ca", osmName: "Kiehl's",
    title: "Birthday beauty gift", titleZh: "生日小禮",
    conditions: "My Kiehl's Rewards member.", window: "month", membershipRequired: true, officialUrl: "https://www.kiehls.ca" },
  { brand: "Shoppers Drug Mart", kind: "chain", category: "retail", website: "https://www.shoppersdrugmart.ca", osmName: "Shoppers Drug Mart",
    title: "PC Optimum surprise birthday offer", titleZh: "PC Optimum 生日驚喜優惠",
    details: "Details vary by member.", conditions: "PC Optimum member.", window: "month", membershipRequired: true,
    officialUrl: "https://www.pcoptimum.ca" },

  // ---- Entertainment ----
  { brand: "Medieval Times Toronto", kind: "local", category: "entertainment", website: "https://www.medievaltimes.com",
    location: { lat: 43.6339, lng: -79.4185, address: "10 Dufferin St (Exhibition Place), Toronto, ON" },
    title: "Free admission for the birthday person", titleZh: "壽星免費入場",
    conditions: "Join the Birthday Fellowship; at least one companion buys a regular-price ticket.", window: "day",
    membershipRequired: true, officialUrl: "https://www.medievaltimes.com" },
  { brand: "Trapped Escape Rooms", kind: "chain", category: "entertainment",
    title: "Birthday player plays free", titleZh: "壽星免費玩一場",
    conditions: "Select locations; rest of the group pays.", window: "custom", windowNote: "Within 2 days of your birthday",
    membershipRequired: false, officialUrl: search("Trapped Escape Rooms Toronto birthday free") },
  { brand: "Escape Manor", kind: "chain", category: "entertainment",
    title: "Birthday player plays free", titleZh: "壽星免費入場",
    conditions: "Rest of the group pays.", window: "custom", windowNote: "Within 3 days of your birthday",
    membershipRequired: false, officialUrl: search("Escape Manor birthday free admission") },
];
