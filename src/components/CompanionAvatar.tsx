import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { EmotionType, BotState } from "../types";

interface CompanionAvatarProps {
  emotion: EmotionType;
  botState: BotState;
}

export default function CompanionAvatar({ emotion, botState }: CompanionAvatarProps) {
  // Determine primary robot body color based on emotion
  const getThemeColors = () => {
    switch (emotion) {
      case "xursand":
        return {
          body: "#10B981", // Emerald green
          face: "#064E3B",
          glow: "rgba(16, 185, 129, 0.4)",
          cheeks: "#F43F5E",
        };
      case "hayajon":
        return {
          body: "#F59E0B", // Amber gold
          face: "#78350F",
          glow: "rgba(245, 158, 11, 0.4)",
          cheeks: "#EC4899",
        };
      case "hafa":
        return {
          body: "#3B82F6", // Blue
          face: "#1E3A8A",
          glow: "rgba(59, 130, 246, 0.3)",
          cheeks: "#93C5FD",
        };
      case "oychan":
        return {
          body: "#8B5CF6", // Purple
          face: "#4C1D95",
          glow: "rgba(139, 92, 246, 0.3)",
          cheeks: "#D8B4FE",
        };
      case "uyqu":
        return {
          body: "#6366F1", // Indigo
          face: "#312E81",
          glow: "rgba(99, 102, 241, 0.2)",
          cheeks: "#818CF8",
        };
      case "hazil":
        return {
          body: "#EC4899", // Pink
          face: "#500724",
          glow: "rgba(236, 72, 153, 0.4)",
          cheeks: "#FBCFE8",
        };
      case "jiddiy":
      default:
        return {
          body: "#6B7280", // Slate gray
          face: "#111827",
          glow: "rgba(107, 114, 128, 0.2)",
          cheeks: "#9CA3AF",
        };
    }
  };

  const colors = getThemeColors();

  // Handle eyes path based on emotion and listening state
  const renderEyes = () => {
    const isListening = botState === "listening";

    // Eyes coordinates
    // Left eye center: 65, Right eye center: 115, Y center: 85
    if (emotion === "uyqu") {
      // Sleeping: closed flat lines
      return (
        <>
          <line x1="55" y1="85" x2="75" y2="85" stroke={colors.face} strokeWidth="6" strokeLinecap="round" />
          <line x1="105" y1="85" x2="125" y2="85" stroke={colors.face} strokeWidth="6" strokeLinecap="round" />
        </>
      );
    }

    if (emotion === "hafa") {
      // Sad: angled downward arches
      return (
        <>
          <path d="M 55 90 Q 65 80 75 90" fill="none" stroke={colors.face} strokeWidth="6" strokeLinecap="round" />
          <path d="M 105 90 Q 115 80 125 90" fill="none" stroke={colors.face} strokeWidth="6" strokeLinecap="round" />
        </>
      );
    }

    if (emotion === "xursand") {
      // Happy: upward curved arches (^ ^)
      return (
        <>
          <path d="M 55 85 Q 65 70 75 85" fill="none" stroke={colors.face} strokeWidth="6" strokeLinecap="round" />
          <path d="M 105 85 Q 115 70 125 85" fill="none" stroke={colors.face} strokeWidth="6" strokeLinecap="round" />
        </>
      );
    }

    if (emotion === "hazil") {
      // Playful: one eye winking, one eye round
      return (
        <>
          {/* Left eye: round */}
          <circle cx="65" cy="85" r="9" fill={colors.face} />
          {/* Right eye: winking line */}
          <path d="M 105 85 Q 115 95 125 85" fill="none" stroke={colors.face} strokeWidth="5" strokeLinecap="round" />
        </>
      );
    }

    if (emotion === "oychan") {
      // Thinking: looking sideways
      return (
        <>
          <g>
            <ellipse cx="65" cy="85" rx="8" ry="10" fill={colors.face} />
            <circle cx="68" cy="83" r="3" fill="#FFF" />
          </g>
          <g>
            <ellipse cx="115" cy="85" rx="8" ry="10" fill={colors.face} />
            <circle cx="118" cy="83" r="3" fill="#FFF" />
          </g>
        </>
      );
    }

    // Default & listening
    const eyeRadiusX = isListening ? 12 : 9;
    const eyeRadiusY = isListening ? 16 : 9;

    return (
      <>
        <g>
          <ellipse cx="65" cy="85" rx={eyeRadiusX} ry={eyeRadiusY} fill={colors.face} />
          <circle cx="65" cy="81" r="3" fill="#FFF" />
        </g>
        <g>
          <ellipse cx="115" cy="85" rx={eyeRadiusX} ry={eyeRadiusY} fill={colors.face} />
          <circle cx="115" cy="81" r="3" fill="#FFF" />
        </g>
      </>
    );
  };

  // Handle mouth path based on emotion and speaking state
  const renderMouth = () => {
    const isSpeaking = botState === "speaking";

    if (isSpeaking) {
      // Speaking animation: fluctuating wave/height using motion
      return (
        <motion.ellipse
          cx="90"
          cy="115"
          rx="12"
          animate={{ ry: [3, 14, 3] }}
          transition={{ repeat: Infinity, duration: 0.4 }}
          fill={colors.face}
        />
      );
    }

    switch (emotion) {
      case "xursand":
      case "hayajon":
        // Big smile
        return <path d="M 78 112 Q 90 128 102 112" fill="none" stroke={colors.face} strokeWidth="6" strokeLinecap="round" />;
      case "hafa":
        // Downward frown
        return <path d="M 80 118 Q 90 108 100 118" fill="none" stroke={colors.face} strokeWidth="6" strokeLinecap="round" />;
      case "uyqu":
        // Small round mouth (sleeping breath o)
        return <circle cx="90" cy="115" r="4" fill={colors.face} />;
      case "hazil":
        // Tongue sticking out or happy grin
        return (
          <g>
            <path d="M 78 112 Q 90 125 102 112" fill="none" stroke={colors.face} strokeWidth="6" strokeLinecap="round" />
            <path d="M 86 117 Q 90 128 94 117" fill="#F43F5E" />
          </g>
        );
      case "oychan":
        // Straight slightly tilted line
        return <line x1="80" y1="115" x2="100" y2="113" stroke={colors.face} strokeWidth="5" strokeLinecap="round" />;
      case "jiddiy":
      default:
        // Straight neutral line
        return <line x1="80" y1="115" x2="100" y2="115" stroke={colors.face} strokeWidth="5" strokeLinecap="round" />;
    }
  };

  // Antenna/Ears layout
  const renderAntenna = () => {
    const isThinking = botState === "thinking";

    return (
      <g>
        {/* Central antenna pole */}
        <line x1="90" y1="40" x2="90" y2="15" stroke={colors.body} strokeWidth="6" strokeLinecap="round" />
        {/* Antenna bulb with glow */}
        <motion.circle
          cx="90"
          cy="12"
          r="8"
          fill={colors.body}
          animate={
            isThinking
              ? { scale: [1, 1.4, 1], fill: ["#A78BFA", "#F59E0B", "#A78BFA"] }
              : emotion === "hayajon"
              ? { scale: [1, 1.3, 1], fill: ["#F59E0B", "#EC4899", "#F59E0B"] }
              : { scale: 1 }
          }
          transition={{ repeat: Infinity, duration: 1.2 }}
        />
        {/* Ears */}
        <rect x="25" y="70" width="8" height="20" rx="4" fill={colors.body} />
        <rect x="147" y="70" width="8" height="20" rx="4" fill={colors.body} />
      </g>
    );
  };

  // Determine standard motion values based on state/emotion
  const getRobotAnimation = () => {
    if (emotion === "xursand") {
      // Jumps/bounces enthusiastically
      return {
        y: [0, -35, 0],
        transition: {
          duration: 0.6,
          repeat: Infinity,
          repeatType: "reverse" as const,
        },
      };
    }
    if (emotion === "hayajon") {
      // Excited vibrate & slight scale
      return {
        x: [-2, 2, -2, 2, 0],
        y: [-1, 1, -1, 0],
        scale: [1, 1.05, 1],
        transition: {
          duration: 0.4,
          repeat: Infinity,
        },
      };
    }
    if (botState === "thinking") {
      // Thinking: floats gently up/down and tilts left/right
      return {
        y: [-8, 8, -8],
        rotate: [-3, 3, -3],
        transition: {
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        },
      };
    }
    if (emotion === "uyqu") {
      // Sleeping: very slow breathing rise and fall
      return {
        y: [0, 4, 0],
        scaleY: [1, 0.97, 1],
        transition: {
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        },
      };
    }
    // Idle/listening/speaking default gentle float
    return {
      y: [-4, 4, -4],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut",
      },
    };
  };

  return (
    <div className="relative flex flex-col items-center justify-center h-64 w-64 mx-auto select-none">
      {/* Decorative background glow circle */}
      <div
        className="absolute inset-4 rounded-full filter blur-2xl transition-all duration-700 -z-10"
        style={{ backgroundColor: colors.glow }}
      />

      {/* Floating particles for excited/happy states */}
      <AnimatePresence>
        {emotion === "uyqu" && (
          <>
            {/* Sleeping Zzzs */}
            <motion.span
              className="absolute text-lg font-bold text-indigo-400 select-none pointer-events-none"
              initial={{ opacity: 0, x: 20, y: -20, scale: 0.5 }}
              animate={{ opacity: [0, 1, 0], x: [20, 40, 50], y: [-20, -50, -70], scale: [0.5, 1, 1.2] }}
              transition={{ repeat: Infinity, duration: 2.5, delay: 0 }}
            >
              Z
            </motion.span>
            <motion.span
              className="absolute text-sm font-bold text-indigo-300 select-none pointer-events-none"
              initial={{ opacity: 0, x: 25, y: -15, scale: 0.5 }}
              animate={{ opacity: [0, 1, 0], x: [25, 45, 60], y: [-15, -40, -60], scale: [0.5, 0.9, 1.1] }}
              transition={{ repeat: Infinity, duration: 2.5, delay: 0.8 }}
            >
              z
            </motion.span>
            <motion.span
              className="absolute text-xs font-bold text-indigo-200 select-none pointer-events-none"
              initial={{ opacity: 0, x: 30, y: -10, scale: 0.5 }}
              animate={{ opacity: [0, 1, 0], x: [30, 48, 55], y: [-10, -30, -45], scale: [0.5, 0.8, 1.0] }}
              transition={{ repeat: Infinity, duration: 2.5, delay: 1.6 }}
            >
              z
            </motion.span>
          </>
        )}

        {emotion === "hayajon" && (
          <>
            {/* Sparkle hearts or stars */}
            <motion.span
              className="absolute text-xl pointer-events-none"
              initial={{ opacity: 0, y: 10, scale: 0 }}
              animate={{ opacity: [0, 1, 0], x: [-60, -90], y: [-40, -90], scale: [0, 1.2, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              ✨
            </motion.span>
            <motion.span
              className="absolute text-xl pointer-events-none"
              initial={{ opacity: 0, y: 10, scale: 0 }}
              animate={{ opacity: [0, 1, 0], x: [60, 90], y: [-30, -80], scale: [0, 1.2, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.7, delay: 0.3 }}
            >
              💖
            </motion.span>
          </>
        )}

        {botState === "thinking" && (
          <motion.div
            className="absolute -top-4 -right-2 bg-purple-600 text-white font-extrabold text-sm h-6 w-6 rounded-full flex items-center justify-center shadow-md select-none"
            animate={{ y: [-3, 3, -3], scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            ?
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main interactive SVG Robot Body */}
      <motion.svg
        width="100%"
        height="100%"
        viewBox="0 0 180 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        animate={getRobotAnimation() as any}
        className="cursor-pointer"
      >
        {/* Antenna Pole & Ears */}
        {renderAntenna()}

        {/* Neck connector */}
        <rect x="78" y="130" width="24" height="15" rx="3" fill="#4B5563" stroke="#374151" strokeWidth="2" />

        {/* Floating robot limb joints if any (shadow plate) */}
        <ellipse cx="90" cy="155" rx="45" ry="10" fill="rgba(0,0,0,0.15)" />

        {/* Main Head / Body block */}
        <rect
          x="35"
          y="45"
          width="110"
          height="90"
          rx="28"
          fill={colors.body}
          stroke="#1F2937"
          strokeWidth="6"
          style={{ transition: "fill 0.6s ease" }}
        />

        {/* Screen/Faceplate Area */}
        <rect
          x="47"
          y="57"
          width="86"
          height="66"
          rx="18"
          fill="#E5E7EB"
          stroke="#374151"
          strokeWidth="4"
        />

        {/* Blushing cheeks based on emotion */}
        {(emotion === "xursand" || emotion === "hayajon" || emotion === "hazil") && (
          <>
            {/* Left cheek blush */}
            <circle cx="58" cy="100" r="6" fill={colors.cheeks} opacity="0.6" />
            {/* Right cheek blush */}
            <circle cx="122" cy="100" r="6" fill={colors.cheeks} opacity="0.6" />
          </>
        )}

        {/* Render Eyes & Mouth */}
        {renderEyes()}
        {renderMouth()}
      </motion.svg>
    </div>
  );
}
