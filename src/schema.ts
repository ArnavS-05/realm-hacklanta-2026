import { z } from "zod";
export const V3Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export const ObjectSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/),
  label: z.string().min(1).max(80),
  shape: z.enum(["box", "cylinder", "sphere"]),
  positionNormalized: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  approximateScale: z.object({
    x: z.number().min(0.04).max(2),
    y: z.number().min(0.04).max(1.5),
    z: z.number().min(0.04).max(2),
  }),
  bbox: z.tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ]),
  supportSurface: z.string().max(50),
  interactable: z.boolean(),
  confidence: z.number().min(0).max(1),
  massKg: z.number().min(0.01).max(30),
});
export const SceneSchema = z.object({
  sceneType: z.string().max(120),
  objects: z.array(ObjectSchema).max(16),
  surfaces: z
    .array(
      z.object({
        id: z.string().max(50),
        label: z.string().max(80),
        height: z.number().min(0.3).max(1.2),
        width: z.number().min(0.5).max(3),
        depth: z.number().min(0.4).max(2),
      }),
    )
    .max(4),
  obstacles: z.array(z.string().max(50)).max(16),
  suggestedTasks: z.array(z.string().max(160)).max(5),
});
export const PlanSchema = z.object({
  goal: z.string().max(200),
  steps: z
    .array(
      z.object({
        action: z.enum([
          "locate",
          "approach",
          "reach",
          "grasp",
          "lift",
          "move",
          "place",
          "release",
        ]),
        target: z.string().max(50),
        relation: z.enum(["none", "beside"]),
      }),
    )
    .min(1)
    .max(12),
});
export type Scene = z.infer<typeof SceneSchema>;
export type SceneObject = z.infer<typeof ObjectSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type V3 = [number, number, number];
export function validateScene(scene: Scene) {
  const ids = scene.objects.map((o) => o.id);
  if (new Set(ids).size !== ids.length) throw Error("Duplicate object IDs");
  const surfaces = scene.surfaces.map((s) => s.id);
  if (
    new Set(surfaces).size !== surfaces.length ||
    surfaces.some((s) => ids.includes(s))
  )
    throw Error("Duplicate surface IDs");
  for (const o of scene.objects) {
    if (o.supportSurface && !surfaces.includes(o.supportSurface))
      throw Error("Unknown support surface");
    if (o.bbox[2] <= o.bbox[0] || o.bbox[3] <= o.bbox[1])
      throw Error("Invalid image bounds");
  }
  if (scene.obstacles.some((id) => !ids.includes(id)))
    throw Error("Unknown obstacle");
  return scene;
}
export function validatePlan(plan: Plan, scene: Scene) {
  for (const step of plan.steps) {
    if (!scene.objects.some((o) => o.id === step.target))
      throw Error("Plan references an unknown object");
    if (
      ["grasp", "reach", "lift"].includes(step.action) &&
      !scene.objects.find((o) => o.id === step.target)?.interactable
    )
      throw Error("Target cannot be manipulated");
  }
  const actions = plan.steps.map((s) => s.action);
  if (
    actions.includes("grasp") &&
    (!actions.includes("release") ||
      actions.indexOf("release") < actions.indexOf("grasp"))
  )
    throw Error("Manipulation must finish with release");
  return plan;
}
