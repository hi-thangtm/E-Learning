import { expect, test } from "@playwright/test";
import { gotoReady, pageAs } from "./helpers/auth";
import { db, enroll, userByCode } from "./helpers/db";

/** Kịch bản 6 — Thư viện (tự đăng ký / huỷ) + lộ trình (khoá sau mở khi xong khoá trước). Dùng khoá + lộ trình có sẵn trong seed. */

test("tự đăng ký khoá trong thư viện rồi huỷ tự đăng ký", async ({ browser }) => {
  const course = await db.course.findUniqueOrThrow({ where: { code: "TEST-TU-DANG-KY" } });
  const learner = await userByCode("TEST-LN5");
  await db.enrollment.deleteMany({ where: { userId: learner.id, courseId: course.id } }); // chạy lại được không cần seed
  const page = await pageAs(browser, "TEST-LN5");

  await gotoReady(page, `/library?q=${encodeURIComponent(course.title)}`); // lọc theo tên — thư viện có nhiều khoá hơn sau mỗi lượt chạy
  await page.getByText(course.title).first().click();
  await expect(page).toHaveURL(new RegExp(`/library/${course.id}`));
  await page.getByRole("button", { name: "Đăng ký học" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Đăng ký", exact: true }).click();
  await expect.poll(async () => (await db.enrollment.findFirst({ where: { userId: learner.id, courseId: course.id } }))?.source).toBe("SELF");
  const e = await db.enrollment.findFirstOrThrow({ where: { userId: learner.id, courseId: course.id } });
  expect(e.status).toBe("NOT_STARTED");
  expect(e.dueDate).toBeNull(); // tự đăng ký không có hạn

  await gotoReady(page, `/my-courses/${course.id}`);
  await page.getByRole("button", { name: "Huỷ đăng ký" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Huỷ đăng ký" }).click();
  await expect.poll(async () => (await db.enrollment.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("CANCELLED");
});

test("lộ trình: khoá sau bị khoá đến khi hoàn thành khoá trước", async ({ browser }) => {
  const path = await db.learningPath.findUniqueOrThrow({ where: { code: "TEST-LT" }, include: { courses: { orderBy: { sortOrder: "asc" }, include: { course: { include: { sections: { include: { lessons: true } } } } } } } });
  const [first, second] = path.courses.map((pc) => pc.course);
  const secondLesson = second.sections[0].lessons[0];
  const learner = await userByCode("TEST-LN4");
  const courseIds = [first.id, second.id];
  await db.enrollment.deleteMany({ where: { userId: learner.id, courseId: { in: courseIds } } }); // chạy lại được không cần seed
  await db.lessonProgress.deleteMany({ where: { userId: learner.id, lesson: { section: { courseId: { in: courseIds } } } } });
  const e1 = await enroll("TEST-LN4", first.id, { learningPathId: path.id, source: "ASSIGNED" });
  await enroll("TEST-LN4", second.id, { learningPathId: path.id, source: "ASSIGNED" });

  const page = await pageAs(browser, "TEST-LN4");
  await page.goto(`/learning-paths/${path.id}`);
  await expect(page.getByText(`để mở`).first()).toBeVisible();
  // Gõ thẳng URL bài của khoá 2 → về trang lộ trình
  await page.goto(`/learn/${second.id}/${secondLesson.id}`);
  await expect(page).toHaveURL(new RegExp(`/learning-paths/${path.id}`));

  // Hoàn thành khoá 1 → khoá 2 mở
  const firstLesson = first.sections[0].lessons[0];
  await db.lessonProgress.create({ data: { userId: learner.id, lessonId: firstLesson.id, isCompleted: true, completedAt: new Date() } });
  await db.enrollment.update({ where: { id: e1.id }, data: { status: "COMPLETED", progressPercent: 100, completedAt: new Date(), completedVersion: 1, acknowledgedVersion: 1 } });
  await page.goto(`/learn/${second.id}/${secondLesson.id}`);
  await expect(page).toHaveURL(new RegExp(`/learn/${second.id}/${secondLesson.id}$`));
  await page.goto(`/learning-paths/${path.id}`);
  await expect(page.getByText("✓ Hoàn thành").first()).toBeVisible();
});
