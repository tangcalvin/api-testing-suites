package com.philomath.api.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.ArrayList;
import java.util.List;

public class MutuallyExclusiveValidator implements ConstraintValidator<MutuallyExclusive, Object> {

    private String[] names;

    @Override
    public void initialize(MutuallyExclusive annotation) {
        names = annotation.value();
    }

    @Override
    public boolean isValid(Object value, ConstraintValidatorContext context) {
        if (value == null || names == null || names.length < 2) {
            return true;
        }
        List<String> present = new ArrayList<>();
        for (String name : names) {
            if (name == null || name.isBlank()) {
                continue;
            }
            if (isPresent(read(value, name))) {
                present.add(name);
            }
        }
        if (present.size() < 2) {
            return true;
        }
        context.disableDefaultConstraintViolation();
        String message = String.join(" and ", present) + " cannot both be set";
        for (String name : present) {
            context.buildConstraintViolationWithTemplate(message)
                    .addPropertyNode(name)
                    .addConstraintViolation();
        }
        return false;
    }

    private static boolean isPresent(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof String text) {
            return !text.isBlank();
        }
        return true;
    }

    private static Object read(Object target, String name) {
        try {
            return target.getClass().getMethod(name).invoke(target);
        } catch (ReflectiveOperationException exception) {
            return null;
        }
    }
}
