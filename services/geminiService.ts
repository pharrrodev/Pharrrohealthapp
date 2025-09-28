import { GoogleGenAI, Type } from "@google/genai";
import { FoodItem, UserMedication } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Validates if an image contains a glucose meter.
 * @param base64Image The base64-encoded image data.
 * @param mimeType The MIME type of the image.
 * @returns A boolean indicating if the image is a valid glucose meter.
 */
export const isImageOfGlucoseMeter = async (base64Image: string, mimeType: string): Promise<boolean> => {
    try {
        const imagePart = { inlineData: { data: base64Image, mimeType } };
        const textPart = { text: "Does this image contain a glucose meter or a continuous glucose monitor (CGM) screen? Respond with only a JSON object containing a single boolean property 'isMeter'." };
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts: [imagePart, textPart] },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isMeter: { type: Type.BOOLEAN }
              },
              required: ["isMeter"]
            },
          },
        });

        const parsed = JSON.parse(response.text.trim());
        return parsed.isMeter;
      } catch (error) {
        console.error("Error validating glucose meter image:", error);
        return false; // Fail safely
      }
};

/**
 * Validates if an image contains food.
 * @param base64Image The base64-encoded image data.
 * @param mimeType The MIME type of the image.
 * @returns A boolean indicating if the image contains food.
 */
export const isImageOfFood = async (base64Image: string, mimeType: string): Promise<boolean> => {
    try {
        const imagePart = { inlineData: { data: base64Image, mimeType } };
        const textPart = { text: "Does this image primarily contain edible food items intended for human consumption? Respond with only a JSON object containing a single boolean property 'isFood'." };
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts: [imagePart, textPart] },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isFood: { type: Type.BOOLEAN }
              },
              required: ["isFood"]
            },
          },
        });

        const parsed = JSON.parse(response.text.trim());
        return parsed.isFood;
      } catch (error) {
        console.error("Error validating food image:", error);
        return false; // Fail safely
      }
};

/**
 * Parses a text transcript to extract glucose reading information.
 * @param transcript The text to parse, e.g., "My blood sugar is 150 after lunch".
 * @returns An object with the parsed value, unit, and context, or null if parsing fails.
 */
export const parseGlucoseReadingFromText = async (transcript: string): Promise<{ value: number; unit: string; context: string; } | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Parse the glucose reading from this text: "${transcript}". Identify the value, the unit (mg/dL or mmol/L), and the context. The context must be one of the following strings: 'fasting', 'before_meal', 'after_meal', 'random', 'bedtime'. For example, if the user says 'after lunch' or 'after eating', the context should be 'after_meal'. If they say 'before breakfast', it should be 'before_meal'. If they say 'on waking', it should be 'fasting'.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            value: { type: Type.NUMBER, description: "The numerical glucose value." },
            unit: { type: Type.STRING, description: "The unit, either 'mg/dL' or 'mmol/L'." },
            context: { type: Type.STRING, description: "The context of the reading. Must be one of: 'fasting', 'before_meal', 'after_meal', 'random', 'bedtime'." }
          },
          required: ["value", "unit", "context"]
        },
      },
    });

    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);
    
    // Basic validation
    if (parsed && typeof parsed.value === 'number' && typeof parsed.unit === 'string' && typeof parsed.context === 'string') {
      return parsed;
    }
    return null;
  } catch (error) {
    console.error("Error parsing glucose reading with Gemini:", error);
    return null;
  }
};

/**
 * Parses a glucose reading from an image of a glucose meter.
 * @param base64Image The base64-encoded image data.
 * @param mimeType The MIME type of the image (e.g., 'image/jpeg').
 * @returns An object with the parsed value, unit, and context, or null if parsing fails.
 * @throws An error if the image is not a glucose meter.
 */
export const parseGlucoseReadingFromImage = async (base64Image: string, mimeType: string): Promise<{ value: number; unit: string; context: string; } | null> => {
  const isMeter = await isImageOfGlucoseMeter(base64Image, mimeType);
  if (!isMeter) {
      throw new Error("Image does not appear to contain a glucose meter.");
  }
  
  try {
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: mimeType,
      },
    };
    const textPart = {
      text: "Analyze the image of a glucose meter. Extract the primary numerical glucose reading. Also determine the unit (mg/dL or mmol/L) if visible. The context is likely 'random' unless text like 'before meal' or 'after meal' is clearly visible. The context must be one of the following strings: 'fasting', 'before_meal', 'after_meal', 'random', 'bedtime'."
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            value: { type: Type.NUMBER, description: "The numerical glucose value." },
            unit: { type: Type.STRING, description: "The unit, either 'mg/dL' or 'mmol/L'." },
            context: { type: Type.STRING, description: "The context of the reading. Must be one of: 'fasting', 'before_meal', 'after_meal', 'random', 'bedtime'." }
          },
          required: ["value", "unit", "context"]
        },
      }
    });

    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);
    
    if (parsed && typeof parsed.value === 'number' && typeof parsed.unit === 'string' && typeof parsed.context === 'string') {
      return parsed;
    }
    return null;

  } catch (error) {
    console.error("Error parsing glucose from image with Gemini:", error);
    return null;
  }
};


/**
 * Parses a text transcript to extract a medication name and quantity.
 * @param transcript The text to parse, e.g., "Metformin one pill".
 * @param userMedications The list of the user's medications.
 * @returns An object with the matched medication and quantity, or null if parsing fails.
 */
export const parseMedicationFromText = async (transcript: string, userMedications: UserMedication[]): Promise<{ matchedMed: UserMedication; quantity: number; } | null> => {
  if (userMedications.length === 0) return null;
  
  const medicationNames = userMedications.map(m => m.name);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Given this list of medications: ${JSON.stringify(medicationNames)}. The user said: "${transcript}". Identify which medication from the list was mentioned and the quantity taken. The quantity can be a word (e.g., "one", "two pills") or a number (e.g., "1", "2"). Respond with a JSON object containing the matched medication 'name' and the numerical 'quantity'.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "The best matching medication name from the provided list." },
            quantity: { type: Type.NUMBER, description: "The number of pills or units taken." }
          },
          required: ["name", "quantity"]
        },
      },
    });
    
    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);

    if (parsed && typeof parsed.name === 'string' && typeof parsed.quantity === 'number' && parsed.quantity > 0) {
      const matchedMed = userMedications.find(m => m.name.toLowerCase() === parsed.name.toLowerCase());
      if (matchedMed) {
          return { matchedMed, quantity: parsed.quantity };
      }
    }
    return null;

  } catch (error) {
    console.error("Error parsing medication from text with Gemini:", error);
    return null;
  }
};


/**
 * Analyzes an image of a meal to identify food items and their nutritional content.
 * @param base64Image The base64-encoded image data.
 * @param mimeType The MIME type of the image (e.g., 'image/jpeg').
 * @returns An object containing the list of identified food items and total nutrition, or null on failure.
 * @throws An error if the image does not contain food.
 */
export const analyzeMealPhoto = async (base64Image: string, mimeType: string): Promise<{ foodItems: FoodItem[], totalNutrition: FoodItem['nutrition'] } | null> => {
  const isFood = await isImageOfFood(base64Image, mimeType);
    if (!isFood) {
        throw new Error("Image does not appear to contain food.");
    }
  
  try {
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: mimeType,
      },
    };
    const textPart = {
      text: "You are an expert nutritionist. Analyze the food in this image. Identify each distinct food item and estimate its nutritional content in grams for carbohydrates, protein, and fat, and total calories. Provide a total for the entire meal. Be as accurate as possible."
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foodItems: {
              type: Type.ARRAY,
              description: "List of identified food items in the meal.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Name of the food item." },
                  nutrition: {
                    type: Type.OBJECT,
                    properties: {
                      carbohydrates: { type: Type.NUMBER, description: "Carbohydrates in grams." },
                      calories: { type: Type.NUMBER, description: "Total calories." },
                      protein: { type: Type.NUMBER, description: "Protein in grams." },
                      fat: { type: Type.NUMBER, description: "Fat in grams." }
                    },
                    required: ["carbohydrates", "calories", "protein", "fat"]
                  }
                },
                required: ["name", "nutrition"]
              }
            },
            totalNutrition: {
              type: Type.OBJECT,
              description: "The sum of nutrition for all food items.",
              properties: {
                carbohydrates: { type: Type.NUMBER, description: "Total carbohydrates in grams." },
                calories: { type: Type.NUMBER, description: "Total calories." },
                protein: { type: Type.NUMBER, description: "Total protein in grams." },
                fat: { type: Type.NUMBER, description: "Total fat in grams." }
              },
              required: ["carbohydrates", "calories", "protein", "fat"]
            }
          },
          required: ["foodItems", "totalNutrition"]
        },
      }
    });

    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);
    
    // Basic validation
    if (parsed && Array.isArray(parsed.foodItems) && parsed.totalNutrition) {
      return parsed;
    }
    return null;

  } catch (error) {
    console.error("Error analyzing meal photo with Gemini:", error);
    return null;
  }
};

/**
 * Analyzes a text description of a meal to identify food items and their nutritional content.
 * @param transcript The text description of the meal.
 * @returns An object containing the list of identified food items and total nutrition, or null on failure.
 */
export const parseMealFromText = async (transcript: string): Promise<{ foodItems: FoodItem[], totalNutrition: FoodItem['nutrition'] } | null> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an expert nutritionist. Analyze the food described in this text: "${transcript}". Identify each distinct food item and estimate its nutritional content in grams for carbohydrates, protein, and fat, and total calories. Provide a total for the entire meal. Be as accurate as possible.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foodItems: {
              type: Type.ARRAY,
              description: "List of identified food items in the meal.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Name of the food item." },
                  nutrition: {
                    type: Type.OBJECT,
                    properties: {
                      carbohydrates: { type: Type.NUMBER, description: "Carbohydrates in grams." },
                      calories: { type: Type.NUMBER, description: "Total calories." },
                      protein: { type: Type.NUMBER, description: "Protein in grams." },
                      fat: { type: Type.NUMBER, description: "Fat in grams." }
                    },
                    required: ["carbohydrates", "calories", "protein", "fat"]
                  }
                },
                required: ["name", "nutrition"]
              }
            },
            totalNutrition: {
              type: Type.OBJECT,
              description: "The sum of nutrition for all food items.",
              properties: {
                carbohydrates: { type: Type.NUMBER, description: "Total carbohydrates in grams." },
                calories: { type: Type.NUMBER, description: "Total calories." },
                protein: { type: Type.NUMBER, description: "Total protein in grams." },
                fat: { type: Type.NUMBER, description: "Total fat in grams." }
              },
              required: ["carbohydrates", "calories", "protein", "fat"]
            }
          },
          required: ["foodItems", "totalNutrition"]
        },
      }
    });

    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);
    
    if (parsed && Array.isArray(parsed.foodItems) && parsed.totalNutrition) {
      return parsed;
    }
    return null;

  } catch (error) {
    console.error("Error parsing meal from text with Gemini:", error);
    return null;
  }
};

/**
 * Validates if an image contains a weight scale.
 */
export const isImageOfWeightScale = async (base64Image: string, mimeType: string): Promise<boolean> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ inlineData: { data: base64Image, mimeType } }, { text: "Does this image contain a digital weight scale screen? Respond with only a JSON object containing a single boolean property 'isScale'." }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: { type: Type.OBJECT, properties: { isScale: { type: Type.BOOLEAN } }, required: ["isScale"] },
            },
        });
        return JSON.parse(response.text.trim()).isScale;
    } catch (error) {
        console.error("Error validating weight scale image:", error);
        return false;
    }
};

/**
 * Parses weight from an image of a digital scale.
 * @throws An error if the image is not a weight scale.
 */
export const parseWeightFromImage = async (base64Image: string, mimeType: string): Promise<{ value: number; unit: 'kg' | 'lbs' } | null> => {
    if (!(await isImageOfWeightScale(base64Image, mimeType))) {
        throw new Error("Image does not appear to contain a weight scale.");
    }
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ inlineData: { data: base64Image, mimeType } }, { text: "Analyze the image of a weight scale. Extract the numerical weight reading and the unit (must be 'kg' or 'lbs')." }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        value: { type: Type.NUMBER, description: "The numerical weight value." },
                        unit: { type: Type.STRING, description: "The unit, either 'kg' or 'lbs'." },
                    },
                    required: ["value", "unit"],
                },
            },
        });
        const parsed = JSON.parse(response.text.trim());
        if (parsed && typeof parsed.value === 'number' && (parsed.unit === 'kg' || parsed.unit === 'lbs')) {
            return parsed;
        }
        return null;
    } catch (error) {
        console.error("Error parsing weight from image with Gemini:", error);
        return null;
    }
};

/**
 * Parses weight from a text transcript.
 */
export const parseWeightFromText = async (transcript: string): Promise<{ value: number; unit: 'kg' | 'lbs' } | null> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Parse the weight reading from this text: "${transcript}". Identify the value and the unit (must be 'kg' or 'lbs').`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        value: { type: Type.NUMBER, description: "The numerical weight value." },
                        unit: { type: Type.STRING, description: "The unit, either 'kg' or 'lbs'." },
                    },
                    required: ["value", "unit"],
                },
            },
        });
        const parsed = JSON.parse(response.text.trim());
        if (parsed && typeof parsed.value === 'number' && (parsed.unit === 'kg' || parsed.unit === 'lbs')) {
            return parsed;
        }
        return null;
    } catch (error) {
        console.error("Error parsing weight from text with Gemini:", error);
        return null;
    }
};

/**
 * Validates if an image contains a blood pressure monitor.
 */
export const isImageOfBloodPressureMonitor = async (base64Image: string, mimeType: string): Promise<boolean> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ inlineData: { data: base64Image, mimeType } }, { text: "Does this image contain a digital blood pressure monitor screen? Respond with only a JSON object containing a single boolean property 'isMonitor'." }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: { type: Type.OBJECT, properties: { isMonitor: { type: Type.BOOLEAN } }, required: ["isMonitor"] },
            },
        });
        return JSON.parse(response.text.trim()).isMonitor;
    } catch (error) {
        console.error("Error validating blood pressure monitor image:", error);
        return false;
    }
};

/**
 * Parses blood pressure from an image of a monitor.
 * @throws An error if the image is not a blood pressure monitor.
 */
export const parseBloodPressureFromImage = async (base64Image: string, mimeType: string): Promise<{ systolic: number; diastolic: number; pulse: number } | null> => {
    if (!(await isImageOfBloodPressureMonitor(base64Image, mimeType))) {
        throw new Error("Image does not appear to contain a blood pressure monitor.");
    }
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ inlineData: { data: base64Image, mimeType } }, { text: "Analyze the image of a blood pressure monitor. Extract the systolic, diastolic, and pulse readings." }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        systolic: { type: Type.NUMBER },
                        diastolic: { type: Type.NUMBER },
                        pulse: { type: Type.NUMBER },
                    },
                    required: ["systolic", "diastolic", "pulse"],
                },
            },
        });
        const parsed = JSON.parse(response.text.trim());
        if (parsed && typeof parsed.systolic === 'number' && typeof parsed.diastolic === 'number' && typeof parsed.pulse === 'number') {
            return parsed;
        }
        return null;
    } catch (error) {
        console.error("Error parsing blood pressure from image with Gemini:", error);
        return null;
    }
};

/**
 * Parses blood pressure from a text transcript.
 */
export const parseBloodPressureFromText = async (transcript: string): Promise<{ systolic: number; diastolic: number; pulse: number } | null> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Parse the blood pressure reading from text: "${transcript}". Identify systolic, diastolic, and pulse values. For example, '120 over 80 with a pulse of 65'.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        systolic: { type: Type.NUMBER },
                        diastolic: { type: Type.NUMBER },
                        pulse: { type: Type.NUMBER },
                    },
                    required: ["systolic", "diastolic", "pulse"],
                },
            },
        });
        const parsed = JSON.parse(response.text.trim());
        if (parsed && typeof parsed.systolic === 'number' && typeof parsed.diastolic === 'number' && typeof parsed.pulse === 'number') {
            return parsed;
        }
        return null;
    } catch (error) {
        console.error("Error parsing blood pressure from text with Gemini:", error);
        return null;
    }
};