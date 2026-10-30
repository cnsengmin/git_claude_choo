# 연도별 시군구 통계를 기준 경계 시군구로 변환한다 (kr-sgg-crosswalk v0.3).
# 추가 패키지 없이 base R만 사용한다.
#
# 예)
#   source("code/harmonize.R")
#   cw <- load_crosswalk("crosswalk/crosswalk_lgu_to_base20251231.csv")
#   df <- read_utf8_csv("내_자료.csv", char_cols = "code")   # year, code, 변수들
#   panel <- harmonize(df, cw, extensive = "pop", intensive = "aged_pct",
#                      intensive_weight = "pop", weights = "pop")

CODE_COLS <- c("src_code", "src_code10", "src_kostat", "tgt_code", "tgt_code10", "tgt_kostat",
               "code", "code10", "kostat", "lgu_code", "lgu_code10", "layer_date", "boundary_version",
               "src_name", "src_sidonm", "tgt_name", "tgt_sidonm", "sidonm", "name", "method")
SRC_KEY <- c(mois = "src_code", mois10 = "src_code10", kostat = "src_kostat")

# UTF-8(BOM 포함) CSV를 OS·로케일과 관계없이 읽는다(Windows R 4.2 미만 포함).
read_utf8_csv <- function(path, char_cols = character(0)) {
  df <- read.csv(path, encoding = "UTF-8", check.names = FALSE, na.strings = "",
                 colClasses = "character", stringsAsFactors = FALSE)
  nm1 <- sub("^X\\.U\\.FEFF\\.", "", names(df)[1], useBytes = TRUE)
  names(df)[1] <- gsub("^[^A-Za-z_]+", "", nm1, useBytes = TRUE)  # BOM 제거
  names(df) <- enc2native(names(df))
  for (nm in setdiff(names(df), char_cols)) {
    num <- suppressWarnings(as.numeric(df[[nm]]))
    if (all(is.na(num) == is.na(df[[nm]]))) df[[nm]] <- num
  }
  for (nm in intersect(names(df), char_cols)) df[[nm]][is.na(df[[nm]])] <- ""
  df
}

load_crosswalk <- function(path) read_utf8_csv(path, char_cols = CODE_COLS)

load_units <- function(path) read_utf8_csv(path, char_cols = CODE_COLS)

# 일반구 단위 자료를 기초자치단체(시) 단위로 합친다. 코드 앞자리를 자르지 않고
# units/sgg_units_by_year.csv의 소속(lgu_code)을 쓴다. 합계형 변수만 넣으세요.
to_lgu <- function(data, sgg_units, year_col = "year", code_col = "code",
                   code_system = "mois", sum_cols = NULL) {
  key <- c(mois = "code", kostat = "kostat")[[code_system]]
  u <- data.frame(y = as.integer(sgg_units$year), k = sgg_units[[key]], lgu = sgg_units$lgu_code,
                  stringsAsFactors = FALSE)
  u <- u[u$k != "", ]
  d <- data
  d[[code_col]] <- trimws(as.character(d[[code_col]]))
  d[[year_col]] <- as.integer(d[[year_col]])
  lgu <- u$lgu[match(paste(d[[year_col]], d[[code_col]]), paste(u$y, u$k))]
  if (any(is.na(lgu))) {
    warning(sprintf("소속 시군구를 찾지 못한 행 %d건은 빠집니다.", sum(is.na(lgu))))
  }
  if (is.null(sum_cols))
    sum_cols <- setdiff(names(d)[vapply(d, is.numeric, logical(1))], c(year_col, code_col))
  d$.lgu <- lgu
  d <- d[!is.na(d$.lgu), ]
  out <- aggregate(d[sum_cols], by = list(y = d[[year_col]], c = d$.lgu),
                   FUN = function(v) if (all(is.na(v))) NA_real_ else sum(v, na.rm = TRUE))
  names(out)[1:2] <- c(year_col, code_col)
  out[order(out[[year_col]], out[[code_col]]), , drop = FALSE]
}

harmonize <- function(data, crosswalk, year_col = "year", code_col = "code", code_system = "mois",
                      extensive = character(0), intensive = character(0),
                      intensive_weight = NULL, weights = "area") {
  if (length(extensive) + length(intensive) == 0)
    stop("extensive 또는 intensive 변수를 하나 이상 지정하세요.")
  if (!is.null(intensive_weight) && !intensive_weight %in% names(data))
    stop(sprintf("intensive_weight '%s' 열이 자료에 없습니다.", intensive_weight))
  if (!code_system %in% names(SRC_KEY)) stop("code_system은 mois, mois10, kostat 중 하나입니다.")
  if (!weights %in% c("area", "pop")) stop("weights는 area 또는 pop입니다.")
  ws <- if (weights == "area") "w_src" else "w_src_pop"
  wt <- if (weights == "area") "w_tgt" else "w_tgt_pop"
  src <- SRC_KEY[[code_system]]

  d <- data
  d[[code_col]] <- trimws(as.character(d[[code_col]]))
  d[[year_col]] <- as.integer(d[[year_col]])

  cw <- crosswalk[crosswalk[[src]] != "", ]
  names(cw)[names(cw) == "year"] <- year_col
  bad <- setdiff(unique(d[[year_col]]), unique(cw[[year_col]]))
  if (length(bad)) stop(sprintf("crosswalk에 없는 연도: %s", paste(sort(bad), collapse = ", ")))

  d$.row <- seq_len(nrow(d))
  m <- merge(d, cw, by.x = c(year_col, code_col), by.y = c(year_col, src))
  miss <- setdiff(d$.row, m$.row)
  if (length(miss))
    warning(sprintf("crosswalk에서 찾지 못한 (연도, 코드) %d건은 결과에서 빠집니다. 예: %s",
                    length(miss), paste(head(paste(d[[year_col]][miss], d[[code_col]][miss]), 5),
                                        collapse = "; ")))
  m$.alloc <- as.numeric(m$method == "area_split")
  keys <- c(year_col, "tgt_code", "tgt_sidonm", "tgt_name")
  grp <- interaction(m[keys], drop = TRUE, lex.order = TRUE)
  out <- unique(m[keys])
  out$.g <- interaction(out[keys], drop = TRUE, lex.order = TRUE)

  sum_by <- function(x) {
    s <- tapply(x, grp, function(v) if (all(is.na(v))) NA_real_ else sum(v, na.rm = TRUE))
    as.numeric(s[as.character(out$.g)])
  }

  for (v in extensive) out[[v]] <- sum_by(m[[v]] * m[[ws]])

  if (length(intensive)) {
    base_w <- if (!is.null(intensive_weight)) m[[intensive_weight]] * m[[ws]] else m[[wt]]
    for (v in intensive) {
      ok <- !is.na(m[[v]]) & !is.na(base_w)
      num <- ifelse(ok, m[[v]] * base_w, NA_real_)
      den <- ifelse(ok, base_w, NA_real_)
      out[[v]] <- sum_by(num) / sum_by(den)
    }
  }

  n_src <- tapply(m[[code_col]], grp, function(v) length(unique(v)))
  out$n_src <- as.integer(n_src[as.character(out$.g)])
  if (length(extensive)) {
    a <- sum_by(m[[extensive[1]]] * m[[ws]] * m$.alloc)
    out$alloc_share <- ifelse(out[[extensive[1]]] == 0 | is.na(out[[extensive[1]]]), 0,
                              round(a / out[[extensive[1]]], 4))
  } else {
    a <- tapply(m$.alloc, grp, max)
    out$alloc_share <- as.numeric(a[as.character(out$.g)])
  }
  out$.g <- NULL
  out <- out[order(out[[year_col]], out$tgt_code), ]
  rownames(out) <- NULL
  out
}

check_totals <- function(data, panel, var, year_col = "year") {
  a <- tapply(data[[var]], data[[year_col]], sum, na.rm = TRUE)
  b <- tapply(panel[[var]], panel[[year_col]], sum, na.rm = TRUE)
  data.frame(year = as.integer(names(a)), before = as.numeric(a),
             after = as.numeric(b[names(a)]),
             diff_pct = round((as.numeric(b[names(a)]) / as.numeric(a) - 1) * 100, 4))
}
