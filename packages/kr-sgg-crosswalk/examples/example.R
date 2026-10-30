# 예제: 연도별 시군구 자료 -> 2025-12-31 기준 기초자치단체 229개 패널
# 패키지 폴더에서 실행: Rscript examples/example.R  (값은 시연용 가상값)
source("code/harmonize.R")
cw <- load_crosswalk("crosswalk/crosswalk_lgu_to_base20251231.csv")
df <- read_utf8_csv("examples/example_synthetic_input_lgu.csv", char_cols = c("code", "sidonm", "name"))
for (w in c("area", "pop")) {
  panel <- harmonize(df, cw, extensive = "pop", intensive = "aged_pct", intensive_weight = "pop", weights = w)
  cat(sprintf("[weights=%s]\n", w))
  print(head(panel, 3))
  print(tail(check_totals(df, panel, "pop"), 3))
  cat("연도별 기준 단위 수:", unique(tapply(panel$tgt_code, panel$year, function(x) length(unique(x)))), "\n")
  write.csv(panel, sprintf("examples/example_output_panel_R_%s.csv", w), row.names = FALSE, fileEncoding = "UTF-8")
}
