"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Button from "@/components/shared/Button";
import { cn } from "@/lib/utils";
import type { HouseFeatures } from "@/lib/api/python-client";

const currentYear = new Date().getFullYear();

const schema = z.object({
  square_footage: z
    .number({ message: "Enter a number" })
    .min(1, "Must be at least 1 sq ft")
    .max(50_000, "Cannot exceed 50,000 sq ft"),

  bedrooms: z
    .number({ message: "Enter a number" })
    .int("Must be a whole number")
    .min(1, "At least 1 bedroom required")
    .max(20, "Maximum 20 bedrooms"),

  bathrooms: z
    .number({ message: "Enter a number" })
    .min(0.5, "Minimum 0.5 bathrooms")
    .max(10, "Maximum 10 bathrooms")
    .multipleOf(0.5, "Use increments of 0.5 (e.g. 1, 1.5, 2)"),

  year_built: z
    .number({ message: "Enter a year" })
    .int("Must be a whole year")
    .min(1800, "Must be 1800 or later")
    .max(currentYear, `Cannot be after ${currentYear}`),

  lot_size: z
    .number({ message: "Enter a number" })
    .min(1, "Must be at least 1 sq ft")
    .max(500_000, "Cannot exceed 500,000 sq ft"),

  distance_to_city_center: z
    .number({ message: "Enter a number" })
    .min(0, "Cannot be negative")
    .max(200, "Maximum 200 miles"),

  school_rating: z
    .number({ message: "Enter a number" })
    .min(0, "Minimum rating is 0")
    .max(10, "Maximum rating is 10"),
});

export type PredictionFormValues = z.infer<typeof schema>;

const fields: {
  name:        keyof PredictionFormValues;
  label:       string;
  placeholder: string;
  hint:        string;
  step:        string;
}[] = [
  {
    name:        "square_footage",
    label:       "Square Footage (sq ft)",
    placeholder: "e.g. 2000",
    hint:        "Total interior living area of the property",
    step:        "1",
  },
  {
    name:        "bedrooms",
    label:       "Bedrooms",
    placeholder: "e.g. 3",
    hint:        "Number of bedrooms (whole number)",
    step:        "1",
  },
  {
    name:        "bathrooms",
    label:       "Bathrooms",
    placeholder: "e.g. 2 or 1.5",
    hint:        "Full or half bathrooms — use 0.5 increments (e.g. 1.5, 2, 2.5)",
    step:        "0.5",
  },
  {
    name:        "year_built",
    label:       "Year Built",
    placeholder: "e.g. 2010",
    hint:        "The year the property was originally constructed",
    step:        "1",
  },
  {
    name:        "lot_size",
    label:       "Lot Size (sq ft)",
    placeholder: "e.g. 6000",
    hint:        "Total land area including the building footprint",
    step:        "1",
  },
  {
    name:        "distance_to_city_center",
    label:       "Distance to City Center (miles)",
    placeholder: "e.g. 5.0",
    hint:        "Straight-line distance to the nearest city centre",
    step:        "0.1",
  },
  {
    name:        "school_rating",
    label:       "School Rating (0–10)",
    placeholder: "e.g. 7.5",
    hint:        "Average rating of schools in the immediate area",
    step:        "0.1",
  },
];

interface Props {
  onSubmit:    (values: PredictionFormValues) => Promise<void>;
  loading:     boolean;
  fillValues?: HouseFeatures | null;
}

export default function PredictionForm({ onSubmit, loading, fillValues }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PredictionFormValues>({ resolver: zodResolver(schema) });

  // Pre-fill form when a suggestion is accepted (keep bathrooms as-is, it's already a float)
  useEffect(() => {
    if (fillValues) {
      reset({
        square_footage:          fillValues.square_footage,
        bedrooms:                fillValues.bedrooms,
        bathrooms:               fillValues.bathrooms,
        year_built:              fillValues.year_built,
        lot_size:                fillValues.lot_size,
        distance_to_city_center: fillValues.distance_to_city_center,
        school_rating:           fillValues.school_rating,
      });
    }
  }, [fillValues, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(({ name, label, placeholder, hint, step }) => {
          const error   = errors[name];
          const inputId = `field-${name}`;
          const hintId  = `hint-${name}`;
          const errId   = `err-${name}`;

          return (
            <div key={name} className="space-y-1">
              <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
                {label}
              </label>
              <input
                {...register(name, { valueAsNumber: true })}
                id={inputId}
                type="number"
                step={step}
                placeholder={placeholder}
                aria-required="true"
                aria-invalid={error ? "true" : "false"}
                aria-describedby={error ? errId : hintId}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors",
                  "focus:ring-2 focus:border-transparent",
                  error
                    ? "border-red-400 bg-red-50 focus:ring-red-400"
                    : "border-slate-200 bg-white hover:border-slate-300 focus:ring-blue-500"
                )}
              />
              {error ? (
                <p id={errId} role="alert" className="text-xs text-red-500 flex items-center gap-1">
                  <span aria-hidden="true">⚠</span> {error.message}
                </p>
              ) : (
                <p id={hintId} className="text-xs text-slate-400">{hint}</p>
              )}
            </div>
          );
        })}
      </div>

      <Button type="submit" loading={loading} className="w-full" size="lg" aria-label="Submit form to predict property price">
        Predict Price
      </Button>
    </form>
  );
}

