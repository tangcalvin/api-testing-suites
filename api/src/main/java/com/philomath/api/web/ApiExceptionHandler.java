package com.philomath.api.web;

import com.philomath.api.error.ApiErrorResponse;
import com.philomath.api.error.FieldException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.exc.InvalidFormatException;

import java.util.List;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidBody(MethodArgumentNotValidException exception) {
        List<FieldException> exceptions = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new FieldException(error.getField(), constraintCode(error.getCodes()), message(error.getDefaultMessage())))
                .toList();
        if (exceptions.isEmpty()) {
            exceptions = List.of(new FieldException("body", "Invalid", message(exception.getMessage())));
        }
        return error(HttpStatus.BAD_REQUEST, exceptions);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleUnreadable(HttpMessageNotReadableException exception) {
        InvalidFormatException invalid = findCause(exception, InvalidFormatException.class);
        if (invalid != null) {
            String field = fieldName(invalid);
            String code = invalid.getTargetType() != null && invalid.getTargetType().isEnum() ? "InvalidEnum" : "InvalidFormat";
            return error(HttpStatus.BAD_REQUEST, List.of(new FieldException(field, code, message(invalid.getOriginalMessage()))));
        }
        JacksonException jackson = findCause(exception, JacksonException.class);
        if (jackson != null) {
            String field = fieldName(jackson);
            return error(HttpStatus.BAD_REQUEST, List.of(new FieldException(field, "MalformedJson", message(jackson.getOriginalMessage()))));
        }
        return error(HttpStatus.BAD_REQUEST, List.of(new FieldException("body", "MalformedJson", "Request body could not be read")));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        return error(HttpStatus.BAD_REQUEST, List.of(new FieldException(
                exception.getName(),
                "InvalidFormat",
                message(exception.getMessage())
        )));
    }

    @ExceptionHandler(OrderNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(OrderNotFoundException exception) {
        return error(HttpStatus.NOT_FOUND, List.of(new FieldException(
                "id",
                "NotFound",
                exception.getMessage()
        )));
    }

    @ExceptionHandler(CustomerNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleCustomerNotFound(CustomerNotFoundException exception) {
        return error(HttpStatus.NOT_FOUND, List.of(new FieldException(
                "id",
                "NotFound",
                exception.getMessage()
        )));
    }

    @ExceptionHandler(ProductNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleProductNotFound(ProductNotFoundException exception) {
        return error(HttpStatus.NOT_FOUND, List.of(new FieldException(
                "id",
                "NotFound",
                exception.getMessage()
        )));
    }

    private static ResponseEntity<ApiErrorResponse> error(HttpStatus status, List<FieldException> exceptions) {
        return ResponseEntity.status(status).body(new ApiErrorResponse(status.value(), exceptions));
    }

    private static String constraintCode(String[] codes) {
        if (codes == null || codes.length == 0 || codes[codes.length - 1] == null || codes[codes.length - 1].isBlank()) {
            return "Invalid";
        }
        return codes[codes.length - 1];
    }

    private static <T extends Throwable> T findCause(Throwable throwable, Class<T> type) {
        Throwable current = throwable;
        for (int depth = 0; current != null && depth < 12; depth++) {
            if (type.isInstance(current)) {
                return type.cast(current);
            }
            Throwable next = current.getCause();
            if (next == current) {
                break;
            }
            current = next;
        }
        return null;
    }

    private static String fieldName(JacksonException exception) {
        if (exception.getPath() == null || exception.getPath().isEmpty()) {
            return "body";
        }
        String field = exception.getPath().stream()
                .map(JacksonException.Reference::getPropertyName)
                .filter(name -> name != null && !name.isBlank())
                .reduce((left, right) -> left + "." + right)
                .orElse("");
        return field.isBlank() ? "body" : field;
    }

    private static String message(String message) {
        return message == null || message.isBlank() ? "invalid" : message;
    }
}
