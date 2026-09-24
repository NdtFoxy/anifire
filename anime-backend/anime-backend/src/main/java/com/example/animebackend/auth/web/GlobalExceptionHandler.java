package com.example.animebackend.auth.web;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import com.example.animebackend.ops.ErrorLog;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Renders consistent, non-leaky error bodies. Stack traces never reach the client;
 * messages are deliberately generic where they could aid enumeration.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private final ErrorLog errorLog;

    public GlobalExceptionHandler(ErrorLog errorLog) {
        this.errorLog = errorLog;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException ex) {
        return body(ex.getStatus(), ex.getCode(), ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, Object> resp = base(HttpStatus.BAD_REQUEST, "validation_error", "Некорректный запрос.");
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fields.putIfAbsent(fe.getField(), fe.getDefaultMessage());
        }
        resp.put("fields", fields);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(resp);
    }

    /**
     * The multipart parser aborts oversized uploads before the handler runs; report it with
     * the same code the image service uses so clients only need one branch.
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleUploadTooLarge(
            MaxUploadSizeExceededException ex) {
        return body(HttpStatus.BAD_REQUEST, "image_too_large", "Файл слишком большой.");
    }

    /**
     * A missing file (e.g. an avatar that was replaced or removed) is a 404, not a server
     * error — otherwise the catch-all below turns every stale image URL into a 500 and a
     * stack trace in the logs.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> handleMissingResource(NoResourceFoundException ex) {
        return body(HttpStatus.NOT_FOUND, "not_found", "Не найдено.");
    }

    /**
     * A path variable or query parameter that cannot be parsed (e.g. {@code /friends/abc})
     * is the caller's mistake, not ours — 400, and no stack trace in the log for what is
     * just a malformed URL.
     */
    @ExceptionHandler({
        MethodArgumentTypeMismatchException.class,
        MissingServletRequestParameterException.class,
        HttpMessageNotReadableException.class,
        // @Validated on a path variable throws this one; without the mapping a
        // malformed country code would surface as a 500.
        ConstraintViolationException.class
    })
    public ResponseEntity<Map<String, Object>> handleMalformedInput(Exception ex) {
        return body(HttpStatus.BAD_REQUEST, "bad_request", "Некорректный запрос.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(
            Exception ex, HttpServletRequest request) {
        // Log server-side; never expose internals to the caller. The same failure is
        // also pushed to the in-memory error feed so the console can show operators
        // that something broke without them tailing a log file.
        org.slf4j.LoggerFactory.getLogger(GlobalExceptionHandler.class)
                .error("Unhandled exception", ex);
        errorLog.record(new ErrorLog.Entry(
                java.time.Instant.now(),
                request.getMethod(),
                request.getRequestURI(),
                ex.getClass().getSimpleName(),
                ex.getMessage() == null ? "" : ex.getMessage().substring(0, Math.min(200, ex.getMessage().length())),
                null));
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "Что-то пошло не так.");
    }

    private ResponseEntity<Map<String, Object>> body(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).body(base(status, code, message));
    }

    private Map<String, Object> base(HttpStatus status, String code, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("timestamp", Instant.now().toString());
        m.put("status", status.value());
        m.put("error", code);
        m.put("message", message);
        return m;
    }
}
