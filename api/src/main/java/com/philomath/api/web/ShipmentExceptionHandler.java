package com.philomath.api.web;

import com.philomath.api.dto.ShipmentCodes;
import com.philomath.api.dto.ShipmentEnvelope;
import com.philomath.api.dto.ShipmentFault;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.exc.InvalidFormatException;

import java.lang.reflect.Method;
import java.util.List;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = ShipmentController.class)
public class ShipmentExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ShipmentEnvelope.ErrorReply> handleInvalidBody(MethodArgumentNotValidException exception) {
        BindingResult binding = exception.getBindingResult();
        List<ShipmentFault> faults = binding.getFieldErrors().stream()
                .map(error -> fault(error.getField(), constraintCode(error.getCodes()), error.getDefaultMessage()))
                .toList();
        if (faults.isEmpty()) {
            faults = List.of(fault("body", "Invalid", exception.getMessage()));
        }
        return fail(userIdFrom(binding.getTarget()), HttpStatus.BAD_REQUEST, "Schema validation error", faults);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ShipmentEnvelope.ErrorReply> handleUnreadable(HttpMessageNotReadableException exception) {
        InvalidFormatException invalid = findCause(exception, InvalidFormatException.class);
        if (invalid != null) {
            String field = fieldName(invalid);
            String constraint = invalid.getTargetType() != null && invalid.getTargetType().isEnum() ? "InvalidEnum" : "InvalidFormat";
            return fail(null, HttpStatus.BAD_REQUEST, "Schema validation error", List.of(fault(field, constraint, invalid.getOriginalMessage())));
        }
        JacksonException jackson = findCause(exception, JacksonException.class);
        if (jackson != null) {
            return fail(null, HttpStatus.BAD_REQUEST, "Schema validation error", List.of(fault(fieldName(jackson), "MalformedJson", jackson.getOriginalMessage())));
        }
        return fail(null, HttpStatus.BAD_REQUEST, "Schema validation error", List.of(fault("body", "MalformedJson", "Request body could not be read")));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ShipmentEnvelope.ErrorReply> handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        return fail(null, HttpStatus.BAD_REQUEST, "Schema validation error", List.of(fault(exception.getName(), "InvalidFormat", exception.getMessage())));
    }

    @ExceptionHandler(ShipmentNotFoundException.class)
    public ResponseEntity<ShipmentEnvelope.ErrorReply> handleNotFound(ShipmentNotFoundException exception) {
        return fail(null, HttpStatus.NOT_FOUND, "Not found", List.of(fault("id", "NotFound", exception.getMessage())));
    }

    static ResponseEntity<ShipmentEnvelope.ErrorReply> fail(String userId, HttpStatus status, String message, List<ShipmentFault> faults) {
        return ResponseEntity.status(status).body(ShipmentEnvelope.fail(userId, message, faults));
    }

    static ShipmentFault fault(String field, String constraint, String detail) {
        String name = fieldLabel(field);
        String code = envelopeCode(constraint);
        String message = switch (code) {
            case ShipmentCodes.MISSING -> "Missing field: " + name;
            case ShipmentCodes.TYPE, ShipmentCodes.MALFORMED -> "Invalid data type: " + name;
            case ShipmentCodes.NOT_FOUND -> "Not found: " + name;
            default -> "Invalid value: " + name;
        };
        if (detail != null && !detail.isBlank() && code.equals(ShipmentCodes.VALUE)) {
            message = "Invalid value: " + name;
        }
        return new ShipmentFault(ShipmentCodes.TYPE_ERROR, code, message);
    }

    static String envelopeCode(String constraint) {
        if (constraint == null || constraint.isBlank()) {
            return ShipmentCodes.VALUE;
        }
        return switch (constraint) {
            case "NotNull", "NotBlank", "NotEmpty" -> ShipmentCodes.MISSING;
            case "InvalidFormat", "InvalidEnum", "MalformedJson", "typeMismatch" -> ShipmentCodes.TYPE;
            case "NotFound" -> ShipmentCodes.NOT_FOUND;
            default -> ShipmentCodes.VALUE;
        };
    }

    static String fieldLabel(String field) {
        String name = field == null || field.isBlank() ? "body" : field;
        if (name.startsWith("data.")) {
            return name.substring("data.".length());
        }
        return name;
    }

    static String constraintCode(String[] codes) {
        if (codes == null || codes.length == 0 || codes[codes.length - 1] == null || codes[codes.length - 1].isBlank()) {
            return "Invalid";
        }
        return codes[codes.length - 1];
    }

    static String userIdFrom(Object target) {
        if (target == null) {
            return null;
        }
        try {
            Method method = target.getClass().getMethod("userId");
            Object value = method.invoke(target);
            return value == null ? null : String.valueOf(value);
        } catch (ReflectiveOperationException ignored) {
            return null;
        }
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
}
