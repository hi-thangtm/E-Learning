import type { HelpChapter } from "../types";
import { BAT_DAU } from "./bat-dau";
import { BIEN_SOAN } from "./bien-soan";
import { HOC_VIEN } from "./hoc-vien";
import { HOI_DAP } from "./hoi-dap";
import { QUAN_LY } from "./quan-ly";
import { QUAN_TRI_CONG_TY } from "./quan-tri-cong-ty";
import { QUAN_TRI_TAP_DOAN } from "./quan-tri-tap-doan";

/** Thứ tự chương trên trang /help. */
export const HELP_CHAPTERS: HelpChapter[] = [BAT_DAU, HOC_VIEN, QUAN_LY, BIEN_SOAN, QUAN_TRI_CONG_TY, QUAN_TRI_TAP_DOAN, HOI_DAP];
