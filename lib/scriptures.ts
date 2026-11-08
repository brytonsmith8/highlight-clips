/**
 * Encouraging Scriptures shown after a successful purchase (King James Version).
 * The list order is the rotation order: each new order gets the verse after the previous order's.
 */
export interface Scripture {
  reference: string;
  theme: string;
  text: string;
}

export const SCRIPTURES: readonly Scripture[] = [
  {
    reference: "Isaiah 40:31",
    theme: "Strength, endurance, and renewed hope",
    text: "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.",
  },
  {
    reference: "Philippians 4:13",
    theme: "Strength through Christ",
    text: "I can do all things through Christ which strengtheneth me.",
  },
  {
    reference: "Proverbs 16:3",
    theme: "Committing your plans to God",
    text: "Commit thy works unto the LORD, and thy thoughts shall be established.",
  },
  {
    reference: "Colossians 3:23",
    theme: "Working wholeheartedly for the Lord",
    text: "And whatsoever ye do, do it heartily, as to the Lord, and not unto men;",
  },
  {
    reference: "Psalm 115:1",
    theme: "Giving God the glory",
    text: "Not unto us, O LORD, not unto us, but unto thy name give glory, for thy mercy, and for thy truth's sake.",
  },
  {
    reference: "James 1:17",
    theme: "Every good gift comes from God",
    text: "Every good gift and every perfect gift is from above, and cometh down from the Father of lights, with whom is no variableness, neither shadow of turning.",
  },
  {
    reference: "Jeremiah 29:11",
    theme: "Hope and God's plans",
    text: "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.",
  },
  {
    reference: "Joshua 1:9",
    theme: "Courage and strength",
    text: "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.",
  },
  {
    reference: "Proverbs 3:5-6",
    theme: "Trusting God and letting Him direct your path",
    text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.",
  },
  {
    reference: "Psalm 46:5",
    theme: "God's presence and help",
    text: "God is in the midst of her; she shall not be moved: God shall help her, and that right early.",
  },
];

export function scriptureByReference(reference: string | null | undefined): Scripture | null {
  if (!reference) return null;
  return SCRIPTURES.find((s) => s.reference === reference) ?? null;
}

/** The verse that follows `previousReference` in the rotation (the first verse if there is none). */
export function nextScripture(previousReference: string | null | undefined): Scripture {
  const at = SCRIPTURES.findIndex((s) => s.reference === previousReference);
  return SCRIPTURES[(at + 1) % SCRIPTURES.length];
}

/**
 * A stable verse derived only from an order id. Used when the saved value is not available
 * (for example before the database column exists), so a page refresh, the page and the email
 * can never disagree for the same order.
 */
export function scriptureForOrder(orderId: string): Scripture {
  let h = 2166136261;
  for (let i = 0; i < orderId.length; i++) {
    h ^= orderId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return SCRIPTURES[h % SCRIPTURES.length];
}

export const THANK_YOU_HEADLINE = "THANK YOU FOR SUPPORTING BRYTVISION!";
export const THANK_YOU_PARAGRAPHS: readonly string[] = [
  "Your support means more than you know. BrytVision is built on faith, purpose, and the belief that the gifts and talents God has given us should be used for His glory.",
  "We hope you enjoy your purchase, celebrate your hard work, and continue pursuing the purpose God has placed on your life.",
  "Remember, your talent is a gift, but what you do with it is your opportunity to glorify the One who gave it to you.",
  "Thank you for being part of the BrytVision family. May God continue to bless you, guide your steps, and give you strength in everything you do.",
];
export const THANK_YOU_SIGNOFF = "ALL FOR THE GLORY OF GOD.";
